/**
 * 태그별 구절 풀 사전 생성 스크립트
 *
 * 실행: ANTHROPIC_API_KEY=sk-ant-... bun run scripts/generate-verse-pools.ts
 *
 * 결과: assets/verse-pools.json
 *   { "두려움": [{ref, text, reason}, ...x20], ... }
 *
 * 설계:
 *   - AI에게는 ref + reason만 요청 (본문은 AI 생성 사용 안 함)
 *   - 생성된 ref를 로컬 manna.db에서 직접 조회해 정확한 본문 확보
 *   - DB에 존재하지 않는 ref는 자동 제거
 *   - 테마당 목표 20개, 여유분을 위해 AI에게 30개 요청
 */

import { Database } from 'bun:sqlite';
import { writeFileSync } from 'fs';
import { join } from 'path';

// ── 설정 ──────────────────────────────────────────────────────────────────────

const TARGET_PER_THEME = 20;
const REQUEST_PER_THEME = 30; // 여유분 포함 요청 수
const DB_PATH = join(import.meta.dir, '../assets/manna.db');
const OUTPUT_PATH = join(import.meta.dir, '../assets/verse-pools.json');

const THEMES = [
  '위로', '두려움', '감사', '기쁨', '지혜', '용기',
  '슬픔', '소망', '믿음', '평안', '관계', '재정',
  '건강', '직장', '결정', '외로움',
] as const;

// 앱의 BOOK_NAME_MAP과 동일
const BOOK_NAME_MAP: Record<string, number> = {
  '창세기': 1, '출애굽기': 2, '레위기': 3, '민수기': 4, '신명기': 5,
  '여호수아': 6, '사사기': 7, '룻기': 8, '사무엘상': 9, '사무엘하': 10,
  '열왕기상': 11, '열왕기하': 12, '역대상': 13, '역대하': 14,
  '에스라': 15, '느헤미야': 16, '에스더': 17, '욥기': 18,
  '시편': 19, '잠언': 20, '전도서': 21, '아가': 22,
  '이사야': 23, '예레미야': 24, '예레미야애가': 25, '에스겔': 26,
  '다니엘': 27, '호세아': 28, '요엘': 29, '아모스': 30,
  '오바댜': 31, '요나': 32, '미가': 33, '나훔': 34,
  '하박국': 35, '스바냐': 36, '학개': 37, '스가랴': 38, '말라기': 39,
  '마태복음': 40, '마가복음': 41, '누가복음': 42, '요한복음': 43,
  '사도행전': 44, '로마서': 45, '고린도전서': 46, '고린도후서': 47,
  '갈라디아서': 48, '에베소서': 49, '빌립보서': 50, '골로새서': 51,
  '데살로니가전서': 52, '데살로니가후서': 53, '디모데전서': 54, '디모데후서': 55,
  '디도서': 56, '빌레몬서': 57, '히브리서': 58, '야고보서': 59,
  '베드로전서': 60, '베드로후서': 61, '요한일서': 62, '요한이서': 63,
  '요한삼서': 64, '유다서': 65, '요한계시록': 66,
};

// 긴 이름 먼저 매칭되도록 정렬
const BOOK_NAME_ENTRIES = Object.entries(BOOK_NAME_MAP)
  .sort((a, b) => b[0].length - a[0].length);

// ── DB 유틸 ──────────────────────────────────────────────────────────────────

function parseRef(ref: string): { bookId: number; chapter: number; verse: number } | null {
  const r = ref.trim();
  for (const [name, bookId] of BOOK_NAME_ENTRIES) {
    if (r.startsWith(name)) {
      const rest = r.slice(name.length).trim();
      // "3:16" 또는 "3장 16절" 형식
      const m = rest.match(/^(\d+)[장:][\s]?(\d+)절?$/);
      if (!m) continue;
      return { bookId, chapter: parseInt(m[1]), verse: parseInt(m[2]) };
    }
  }
  return null;
}

function lookupVerse(db: Database, bookId: number, chapter: number, verse: number): string | null {
  const row = db.query(
    'SELECT text FROM bible WHERE book_id = ? AND chapter = ? AND verse = ?'
  ).get(bookId, chapter, verse) as { text: string } | null;
  return row?.text ?? null;
}

// ── 프롬프트 ──────────────────────────────────────────────────────────────────

function buildPrompt(theme: string, count: number): string {
  const bookNames = Object.keys(BOOK_NAME_MAP).join(', ');
  return `당신은 성경 전문가입니다. "${theme}"라는 주제/감정/상황에 처한 사람에게 실질적인 위로와 힘이 되는 성경 구절 ${count}개를 추천해주세요.

**중요 규칙:**
1. 반드시 아래 책 이름 목록에 있는 정확한 이름만 사용하세요:
   ${bookNames}
2. ref 형식: "책이름 장:절" (예: "요한복음 3:16", "시편 23:1", "이사야 41:10")
3. 단일 절만 추천하세요 (범위 불가: "로마서 8:38-39" 금지 → "로마서 8:38" 처럼 단일 절)
4. 유명한 구절과 덜 알려진 구절을 골고루 섞어주세요
5. 신약/구약 균형있게, 다양한 책에서 선택하세요 (같은 책에서 3개 이상 금지)
6. reason은 "${theme}"와 이 구절이 어떻게 연결되는지 구체적이고 진심어린 1문장 (30-60자)

반드시 아래 JSON 형식으로만 응답하세요 (JSON 외 텍스트 없음):
{"verses":[{"ref":"책이름 장:절","reason":"..."},{"ref":"...","reason":"..."}]}`;
}

// ── JSON 파싱 ─────────────────────────────────────────────────────────────────

function extractJson(text: string): { verses: Array<{ ref: string; reason: string }> } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { verses?: unknown };
    if (!Array.isArray(parsed?.verses)) return null;
    return parsed as { verses: Array<{ ref: string; reason: string }> };
  } catch {
    return null;
  }
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY 환경변수를 설정해주세요');
    console.error('   ANTHROPIC_API_KEY=sk-ant-... bun run scripts/generate-verse-pools.ts');
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  const result: Record<string, Array<{ ref: string; text: string; reason: string }>> = {};

  for (const theme of THEMES) {
    console.log(`\n📖 [${theme}] 생성 중...`);

    let attempts = 0;
    let pool: Array<{ ref: string; text: string; reason: string }> = [];

    // 목표치 미달이면 최대 3번 재시도
    while (pool.length < TARGET_PER_THEME && attempts < 3) {
      attempts++;
      const needed = Math.min(REQUEST_PER_THEME, TARGET_PER_THEME - pool.length + 10);

      let rawText = '';
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-opus-4-6',
            max_tokens: 4096,
            temperature: 1,
            messages: [{ role: 'user', content: buildPrompt(theme, needed) }],
          }),
        });
        if (!res.ok) {
          console.error(`  ⚠️  API HTTP ${res.status} (시도 ${attempts})`);
          continue;
        }
        const json = await res.json() as { content: Array<{ type: string; text: string }> };
        const block = json.content?.find((c) => c.type === 'text');
        rawText = block?.text ?? '';
      } catch (e) {
        console.error(`  ⚠️  API 오류 (시도 ${attempts}):`, e);
        continue;
      }

      const parsed = extractJson(rawText);
      if (!parsed) {
        console.error(`  ⚠️  JSON 파싱 실패 (시도 ${attempts})`);
        continue;
      }

      let added = 0;
      const existingRefs = new Set(pool.map(p => p.ref));

      for (const item of parsed.verses) {
        if (!item.ref || !item.reason) continue;
        if (existingRefs.has(item.ref)) continue; // 중복 제거

        const parsed_ref = parseRef(item.ref);
        if (!parsed_ref) {
          console.log(`  ✗ ref 파싱 실패: "${item.ref}"`);
          continue;
        }

        const text = lookupVerse(db, parsed_ref.bookId, parsed_ref.chapter, parsed_ref.verse);
        if (!text) {
          console.log(`  ✗ DB 미존재: "${item.ref}" (book=${parsed_ref.bookId} ch=${parsed_ref.chapter} v=${parsed_ref.verse})`);
          continue;
        }

        // reason 품질 검사: 너무 짧으면 skip
        if (item.reason.trim().length < 15) {
          console.log(`  ✗ reason 너무 짧음: "${item.ref}"`);
          continue;
        }

        pool.push({ ref: item.ref, text, reason: item.reason.trim() });
        existingRefs.add(item.ref);
        added++;

        if (pool.length >= TARGET_PER_THEME) break;
      }

      console.log(`  ✓ 시도 ${attempts}: ${added}개 추가 → 누계 ${pool.length}개`);
    }

    if (pool.length < TARGET_PER_THEME) {
      console.warn(`  ⚠️  [${theme}] 목표 미달: ${pool.length}/${TARGET_PER_THEME}개`);
    } else {
      console.log(`  ✅ [${theme}] 완료: ${pool.length}개`);
    }

    result[theme] = pool.slice(0, TARGET_PER_THEME);
  }

  db.close();

  writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8');

  // 결과 요약
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('생성 완료 요약:');
  for (const [theme, verses] of Object.entries(result)) {
    const status = verses.length >= TARGET_PER_THEME ? '✅' : '⚠️ ';
    console.log(`  ${status} ${theme}: ${verses.length}개`);
  }
  console.log(`\n📁 저장 위치: ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('❌ 스크립트 실패:', err);
  process.exit(1);
});

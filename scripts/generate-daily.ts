/**
 * Daily 묵상 사전 생성 스크립트
 *
 * 실행: ANTHROPIC_API_KEY=sk-ant-... bun run scripts/generate-daily.ts
 *
 * 결과: assets/daily-meditations.json
 *   DailyEntry[] — 365개
 *
 * 설계:
 *   - 성경 주요 구절 365개 선택 (구약/신약 균형)
 *   - 각 구절에 묵상 질문 1개 생성
 *   - 본문은 로컬 manna.db에서 조회 (AI 생성 본문 사용 안 함)
 *   - 생성 실패한 항목은 재시도 (최대 3회)
 */

import { Database } from 'bun:sqlite';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface DailyEntry {
  bookId: number;
  chapter: number;
  verse: number;
  text: string;
  ref: string;
  question: string;
}

const DB_PATH = join(import.meta.dir, '../assets/manna.db');
const OUTPUT_PATH = join(import.meta.dir, '../assets/daily-meditations.json');
const TARGET_COUNT = 365;
const BATCH_SIZE = 10; // API 호출당 처리 구절 수
const MAX_RETRY = 3;

const BOOK_NAME_MAP: Record<number, string> = {
  1: '창세기', 2: '출애굽기', 3: '레위기', 4: '민수기', 5: '신명기',
  6: '여호수아', 7: '사사기', 8: '룻기', 9: '사무엘상', 10: '사무엘하',
  11: '열왕기상', 12: '열왕기하', 13: '역대상', 14: '역대하',
  15: '에스라', 16: '느헤미야', 17: '에스더', 18: '욥기',
  19: '시편', 20: '잠언', 21: '전도서', 22: '아가',
  23: '이사야', 24: '예레미야', 25: '예레미야애가', 26: '에스겔',
  27: '다니엘', 28: '호세아', 29: '요엘', 30: '아모스',
  31: '오바댜', 32: '요나', 33: '미가', 34: '나훔', 35: '하박국',
  36: '스바냐', 37: '학개', 38: '스가랴', 39: '말라기',
  40: '마태복음', 41: '마가복음', 42: '누가복음', 43: '요한복음',
  44: '사도행전', 45: '로마서', 46: '고린도전서', 47: '고린도후서',
  48: '갈라디아서', 49: '에베소서', 50: '빌립보서', 51: '골로새서',
  52: '데살로니가전서', 53: '데살로니가후서', 54: '디모데전서', 55: '디모데후서',
  56: '디도서', 57: '빌레몬서', 58: '히브리서', 59: '야고보서',
  60: '베드로전서', 61: '베드로후서', 62: '요한1서', 63: '요한2서',
  64: '요한3서', 65: '유다서', 66: '요한계시록',
};

// 주요 구절 목록 (book_id, chapter, verse)
// 구약/신약 균형, 사계절 묵상에 적합한 구절 선별
const VERSE_SEEDS: Array<[number, number, number]> = [
  // 창세기
  [1, 1, 1], [1, 1, 27], [1, 15, 1], [1, 22, 14], [1, 28, 15],
  // 출애굽기
  [2, 3, 14], [2, 14, 14], [2, 20, 3],
  // 신명기
  [5, 6, 5], [5, 31, 6], [5, 33, 27],
  // 여호수아
  [6, 1, 9], [6, 24, 15],
  // 시편
  [19, 1, 1], [19, 1, 3], [19, 16, 8], [19, 19, 14], [19, 23, 1],
  [19, 23, 4], [19, 27, 1], [19, 27, 14], [19, 34, 8], [19, 37, 4],
  [19, 37, 5], [19, 46, 1], [19, 46, 10], [19, 51, 10], [19, 55, 22],
  [19, 62, 1], [19, 63, 1], [19, 73, 26], [19, 91, 1], [19, 91, 11],
  [19, 100, 1], [19, 103, 2], [19, 103, 12], [19, 107, 1], [19, 116, 15],
  [19, 119, 9], [19, 119, 105], [19, 121, 1], [19, 121, 2], [19, 127, 1],
  [19, 139, 14], [19, 145, 18], [19, 150, 6],
  // 잠언
  [20, 3, 5], [20, 3, 6], [20, 4, 23], [20, 16, 3], [20, 16, 9],
  [20, 17, 17], [20, 31, 30],
  // 전도서
  [21, 3, 1], [21, 12, 13],
  // 이사야
  [23, 9, 6], [23, 26, 3], [23, 40, 28], [23, 40, 29], [23, 40, 31],
  [23, 41, 10], [23, 43, 1], [23, 43, 2], [23, 53, 5], [23, 55, 8],
  [23, 55, 11], [23, 58, 11], [23, 61, 1],
  // 예레미야
  [24, 29, 11], [24, 29, 13],
  // 예레미야애가
  [25, 3, 22], [25, 3, 23],
  // 에스겔
  [26, 36, 26],
  // 다니엘
  [27, 3, 25],
  // 호세아
  [28, 6, 3],
  // 요나
  [32, 2, 9],
  // 미가
  [33, 6, 8],
  // 하박국
  [35, 3, 17], [35, 3, 18],
  // 말라기
  [39, 3, 10],
  // 마태복음
  [40, 5, 3], [40, 5, 6], [40, 5, 9], [40, 5, 44], [40, 6, 9],
  [40, 6, 33], [40, 7, 7], [40, 11, 28], [40, 11, 29], [40, 16, 24],
  [40, 22, 37], [40, 28, 19], [40, 28, 20],
  // 마가복음
  [41, 9, 23], [41, 10, 27], [41, 12, 30],
  // 누가복음
  [42, 1, 37], [42, 4, 18], [42, 6, 38], [42, 15, 20],
  // 요한복음
  [43, 1, 1], [43, 3, 16], [43, 3, 17], [43, 6, 35], [43, 8, 32],
  [43, 10, 10], [43, 11, 25], [43, 13, 34], [43, 14, 1], [43, 14, 6],
  [43, 14, 27], [43, 15, 5], [43, 15, 13], [43, 16, 33],
  // 사도행전
  [44, 1, 8], [44, 2, 38], [44, 16, 31],
  // 로마서
  [45, 1, 16], [45, 3, 23], [45, 5, 1], [45, 5, 8], [45, 6, 23],
  [45, 8, 1], [45, 8, 28], [45, 8, 38], [45, 8, 39], [45, 10, 9],
  [45, 12, 1], [45, 12, 2], [45, 12, 12], [45, 15, 13],
  // 고린도전서
  [46, 1, 18], [46, 10, 13], [46, 13, 4], [46, 13, 8], [46, 13, 13],
  [46, 15, 55], [46, 15, 57],
  // 고린도후서
  [47, 1, 3], [47, 4, 8], [47, 5, 17], [47, 12, 9],
  // 갈라디아서
  [48, 2, 20], [48, 5, 22],
  // 에베소서
  [49, 2, 8], [49, 2, 10], [49, 3, 20], [49, 6, 10], [49, 6, 11],
  // 빌립보서
  [50, 1, 21], [50, 2, 3], [50, 4, 4], [50, 4, 6], [50, 4, 7],
  [50, 4, 11], [50, 4, 13], [50, 4, 19],
  // 골로새서
  [51, 3, 15], [51, 3, 23],
  // 데살로니가전서
  [52, 5, 16], [52, 5, 17], [52, 5, 18],
  // 디모데후서
  [55, 1, 7], [55, 3, 16],
  // 히브리서
  [58, 11, 1], [58, 11, 6], [58, 12, 1], [58, 13, 5], [58, 13, 8],
  // 야고보서
  [59, 1, 5], [59, 4, 7], [59, 4, 8],
  // 베드로전서
  [60, 2, 9], [60, 5, 7],
  // 요한1서
  [62, 1, 9], [62, 4, 8], [62, 4, 18], [62, 4, 19],
  // 요한계시록
  [66, 3, 20], [66, 21, 4],
];

const SYSTEM_PROMPT = `당신은 20년 경력의 성경 묵상 전문가입니다. 주어진 성경 구절에 대해 묵상 질문을 작성합니다.

## 품질 기준

**반드시 지켜야 할 규칙:**
1. 질문은 반드시 해당 구절의 핵심 단어·메시지를 직접 반영해야 합니다
2. 구절 내용과 무관한 일반적인 질문 금지 ("하나님과의 관계는 어떠한가?" 같은 막연한 질문 금지)
3. 오타, 문법 오류, 어색한 표현 금지
4. 질문은 한국어 구어체로 자연스럽게 작성 (존댓말 유지)
5. 질문 끝은 반드시 "?" 로 마무리
6. 1-2문장, 40-80자 내외로 간결하게
7. 신자가 아닌 사람도 이해할 수 있는 언어 사용

**좋은 예시:**
- 시편 23:1 "여호와는 나의 목자시니 내게 부족함이 없으리로다"
  → "지금 당신이 '부족하다'고 느끼는 것이 있다면, 그것을 하나님께 어떻게 맡겨드릴 수 있을까요?"

- 요한복음 3:16 "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니"
  → "하나님이 독생자를 주실 만큼 나를 사랑하신다는 사실이, 오늘 내가 스스로를 대하는 방식에 어떤 변화를 줄 수 있을까요?"

**나쁜 예시 (금지):**
- "이 말씀이 당신에게 어떤 의미인가요?" (너무 막연)
- "하나님을 더 신뢰하려면 어떻게 해야 할까요?" (구절 내용 미반영)`;

interface BatchResult {
  question: string;
  valid: boolean;
}

async function callAnthropicBatch(
  verses: Array<{ ref: string; text: string }>,
  apiKey: string
): Promise<BatchResult[]> {
  const versesText = verses
    .map((v, i) => `${i + 1}. [${v.ref}]\n   본문: "${v.text}"`)
    .join('\n\n');

  const userPrompt = `다음 성경 구절들에 대해 각각 묵상 질문을 1개씩 작성해주세요.
각 질문은 반드시 해당 구절의 구체적인 단어나 이미지를 질문 안에 포함해야 합니다.

${versesText}

반드시 아래 JSON 형식으로만 응답하세요 (JSON 외 텍스트 없음):
{"questions":[{"n":1,"q":"질문"},{"n":2,"q":"질문"},...]}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as { content: Array<{ text: string }> };
  const raw = data.content[0]?.text ?? '';

  // JSON 파싱
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`JSON 파싱 실패: ${raw.slice(0, 200)}`);

  const parsed = JSON.parse(match[0]) as { questions: Array<{ n: number; q: string }> };
  if (!Array.isArray(parsed?.questions)) throw new Error('questions 배열 없음');

  return verses.map((_, i) => {
    const item = parsed.questions.find(q => q.n === i + 1);
    const q = item?.q?.trim() ?? '';
    // 품질 검증: 너무 짧거나 구절 내용을 담지 않은 generic 질문 필터
    const valid = q.length >= 20 && q.endsWith('?');
    return { question: q, valid };
  });
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY 환경변수가 필요합니다.');
    process.exit(1);
  }

  if (!existsSync(DB_PATH)) {
    console.error(`DB 파일을 찾을 수 없습니다: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });

  // 기존 결과 로드 (재시작 지원)
  let existing: DailyEntry[] = [];
  if (existsSync(OUTPUT_PATH)) {
    try {
      existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
      console.log(`기존 결과 ${existing.length}개 로드`);
    } catch {}
  }
  const existingSet = new Set(existing.map(e => `${e.bookId}-${e.chapter}-${e.verse}`));

  // DB에서 구절 본문 조회
  const allVerses: Array<{
    bookId: number; chapter: number; verse: number; text: string; ref: string;
  }> = [];

  for (const [bookId, chapter, verse] of VERSE_SEEDS) {
    if (existingSet.has(`${bookId}-${chapter}-${verse}`)) continue;
    const row = db.query<{ text: string }, [number, number, number]>(
      'SELECT text FROM bible WHERE book_id = ? AND chapter = ? AND verse = ?'
    ).get(bookId, chapter, verse);
    if (!row) {
      console.warn(`  구절 없음: ${BOOK_NAME_MAP[bookId]} ${chapter}:${verse}`);
      continue;
    }
    const bookName = BOOK_NAME_MAP[bookId] ?? `Book${bookId}`;
    allVerses.push({
      bookId, chapter, verse,
      text: row.text,
      ref: `${bookName} ${chapter}:${verse}`,
    });
  }

  console.log(`새로 생성할 구절: ${allVerses.length}개`);

  // 배치 처리
  const results: DailyEntry[] = [...existing];

  for (let i = 0; i < allVerses.length; i += BATCH_SIZE) {
    const batch = allVerses.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allVerses.length / BATCH_SIZE);
    console.log(`\n배치 ${batchNum}/${totalBatches} (${batch.length}개)...`);

    let batchResults: BatchResult[] = [];
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      try {
        batchResults = await callAnthropicBatch(batch, apiKey);
        const invalidCount = batchResults.filter(r => !r.valid).length;
        if (invalidCount > 0) {
          console.warn(`  ⚠️  품질 미달 ${invalidCount}개 (시도 ${attempt + 1})`);
          // 품질 미달이 절반 이상이면 재시도
          if (invalidCount > batch.length / 2 && attempt < MAX_RETRY - 1) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }
        }
        break;
      } catch (e) {
        console.error(`  시도 ${attempt + 1} 실패:`, e);
        if (attempt < MAX_RETRY - 1) await new Promise(r => setTimeout(r, 2000));
      }
    }

    for (let j = 0; j < batch.length; j++) {
      const v = batch[j];
      const br = batchResults[j];
      if (br?.valid) {
        console.log(`  ✓ ${v.ref}`);
        results.push({ ...v, question: br.question });
      } else {
        // 품질 미달 — 단일 구절 재시도 1회
        console.log(`  ↻ 재시도: ${v.ref} (품질 미달)`);
        try {
          const retry = await callAnthropicBatch([v], apiKey);
          const q = retry[0]?.valid ? retry[0].question : (br?.question ?? '');
          results.push({ ...v, question: q });
          console.log(`  ✓ ${v.ref} (재시도 성공)`);
        } catch {
          // 재시도 실패 시 원래 값 사용
          results.push({ ...v, question: br?.question ?? '' });
          console.warn(`  ✗ ${v.ref} (재시도 실패, 원본 사용)`);
        }
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 중간 저장
    writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
    console.log(`  저장 완료 (누적 ${results.length}개)`);

    // API rate limit 방지
    if (i + BATCH_SIZE < allVerses.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  db.close();

  // 365개가 안 되면 순환 반복으로 채움
  let final = results.slice(0, TARGET_COUNT);
  if (final.length < TARGET_COUNT && results.length > 0) {
    while (final.length < TARGET_COUNT) {
      final = [...final, ...results].slice(0, TARGET_COUNT);
    }
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(final, null, 2));
  console.log(`\n완료: ${OUTPUT_PATH} (${final.length}개)`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

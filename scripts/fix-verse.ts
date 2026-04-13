/**
 * 성경 구절 오타 수정 도구 (인터랙티브 CLI)
 *
 * 실행: bun run scripts/fix-verse.ts
 *
 * 흐름:
 *   1. 책 이름 검색 (부분 매칭)
 *   2. 장/절 선택
 *   3. 현재 본문 표시
 *   4. 수정 전/후 단어 입력
 *   5. 미리보기 확인 후 반영
 */

import { Database } from 'bun:sqlite';
import { createInterface } from 'readline';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';

const DB_PATH = join(import.meta.dir, '../assets/manna.db');
const CORRECTIONS_PATH = join(import.meta.dir, '../assets/corrections.json');

const BOOKS: Array<{ id: number; name: string }> = [
  { id: 1,  name: '창세기' },     { id: 2,  name: '출애굽기' },
  { id: 3,  name: '레위기' },     { id: 4,  name: '민수기' },
  { id: 5,  name: '신명기' },     { id: 6,  name: '여호수아' },
  { id: 7,  name: '사사기' },     { id: 8,  name: '룻기' },
  { id: 9,  name: '사무엘상' },   { id: 10, name: '사무엘하' },
  { id: 11, name: '열왕기상' },   { id: 12, name: '열왕기하' },
  { id: 13, name: '역대상' },     { id: 14, name: '역대하' },
  { id: 15, name: '에스라' },     { id: 16, name: '느헤미야' },
  { id: 17, name: '에스더' },     { id: 18, name: '욥기' },
  { id: 19, name: '시편' },       { id: 20, name: '잠언' },
  { id: 21, name: '전도서' },     { id: 22, name: '아가' },
  { id: 23, name: '이사야' },     { id: 24, name: '예레미야' },
  { id: 25, name: '예레미야애가' }, { id: 26, name: '에스겔' },
  { id: 27, name: '다니엘' },     { id: 28, name: '호세아' },
  { id: 29, name: '요엘' },       { id: 30, name: '아모스' },
  { id: 31, name: '오바댜' },     { id: 32, name: '요나' },
  { id: 33, name: '미가' },       { id: 34, name: '나훔' },
  { id: 35, name: '하박국' },     { id: 36, name: '스바냐' },
  { id: 37, name: '학개' },       { id: 38, name: '스가랴' },
  { id: 39, name: '말라기' },     { id: 40, name: '마태복음' },
  { id: 41, name: '마가복음' },   { id: 42, name: '누가복음' },
  { id: 43, name: '요한복음' },   { id: 44, name: '사도행전' },
  { id: 45, name: '로마서' },     { id: 46, name: '고린도전서' },
  { id: 47, name: '고린도후서' }, { id: 48, name: '갈라디아서' },
  { id: 49, name: '에베소서' },   { id: 50, name: '빌립보서' },
  { id: 51, name: '골로새서' },   { id: 52, name: '데살로니가전서' },
  { id: 53, name: '데살로니가후서' }, { id: 54, name: '디모데전서' },
  { id: 55, name: '디모데후서' }, { id: 56, name: '디도서' },
  { id: 57, name: '빌레몬서' },   { id: 58, name: '히브리서' },
  { id: 59, name: '야고보서' },   { id: 60, name: '베드로전서' },
  { id: 61, name: '베드로후서' }, { id: 62, name: '요한일서' },
  { id: 63, name: '요한이서' },   { id: 64, name: '요한삼서' },
  { id: 65, name: '유다서' },     { id: 66, name: '요한계시록' },
];

// ── readline 유틸 ─────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

// ── 메인 ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = new Database(DB_PATH);

  console.log('\n=== 성경 구절 오타 수정 도구 ===\n');

  // 1. 책 검색
  const bookQuery = await ask('책 이름 (예: 창세, 요한): ');
  if (!bookQuery) {
    console.log('취소됨.');
    rl.close();
    db.close();
    return;
  }

  const matches = BOOKS.filter(b => b.name.includes(bookQuery));
  if (matches.length === 0) {
    console.log(`"${bookQuery}"에 해당하는 책이 없습니다.`);
    rl.close();
    db.close();
    return;
  }

  let book: { id: number; name: string };
  if (matches.length === 1) {
    book = matches[0];
    console.log(`  -> ${book.name}\n`);
  } else {
    console.log('\n  검색 결과:');
    matches.forEach((b, i) => console.log(`    ${i + 1}. ${b.name}`));
    const pick = await ask(`\n번호 선택 (1-${matches.length}): `);
    const idx = parseInt(pick) - 1;
    if (isNaN(idx) || idx < 0 || idx >= matches.length) {
      console.log('잘못된 선택.');
      rl.close();
      db.close();
      return;
    }
    book = matches[idx];
    console.log(`  -> ${book.name}\n`);
  }

  // 2. 장/절 입력
  const chapterStr = await ask('장 번호: ');
  const chapter = parseInt(chapterStr);
  if (isNaN(chapter) || chapter < 1) {
    console.log('잘못된 장 번호.');
    rl.close();
    db.close();
    return;
  }

  const verseStr = await ask('절 번호: ');
  const verse = parseInt(verseStr);
  if (isNaN(verse) || verse < 1) {
    console.log('잘못된 절 번호.');
    rl.close();
    db.close();
    return;
  }

  // 3. 현재 본문 조회
  const row = db.query(
    'SELECT id, text FROM bible WHERE book_id = ? AND chapter = ? AND verse = ?'
  ).get(book.id, chapter, verse) as { id: number; text: string } | null;

  if (!row) {
    console.log(`${book.name} ${chapter}:${verse} — 해당 구절이 DB에 없습니다.`);
    rl.close();
    db.close();
    return;
  }

  console.log(`\n${book.name} ${chapter}:${verse}`);
  console.log(`현재 본문:\n  "${row.text}"\n`);

  // 4. 수정할 단어 입력
  const oldWord = await ask('수정 전 단어: ');
  if (!oldWord) {
    console.log('취소됨.');
    rl.close();
    db.close();
    return;
  }

  if (!row.text.includes(oldWord)) {
    console.log(`본문에 "${oldWord}"가 없습니다.`);
    rl.close();
    db.close();
    return;
  }

  const newWord = await ask('수정 후 단어: ');
  if (!newWord) {
    console.log('취소됨.');
    rl.close();
    db.close();
    return;
  }

  if (oldWord === newWord) {
    console.log('수정 전후가 동일합니다.');
    rl.close();
    db.close();
    return;
  }

  // 5. 미리보기
  const newText = row.text.replace(oldWord, newWord);
  console.log('\n변경 미리보기:');
  console.log(`  "${newText}"\n`);

  const confirm = await ask('적용할까요? (Y/n): ');
  if (confirm.toLowerCase() === 'n') {
    console.log('취소됨.');
    rl.close();
    db.close();
    return;
  }

  // 6. DB 업데이트
  db.run(
    'UPDATE bible SET text = ? WHERE id = ?',
    [newText, row.id]
  );

  // FTS 테이블도 같이 업데이트
  try {
    db.run(
      'UPDATE bible_fts SET text = ? WHERE rowid = ?',
      [newText, row.id]
    );
  } catch {
    // FTS 테이블이 없거나 에러 시 무시 (다음 마이그레이션에서 재생성됨)
  }

  // 7. corrections.json에 추가 (EAS Update 시 기존 유저에게도 반영)
  let corrections: Array<Record<string, unknown>> = [];
  try {
    corrections = JSON.parse(readFileSync(CORRECTIONS_PATH, 'utf-8'));
  } catch {}

  const today = new Date().toISOString().slice(0, 10);
  const alreadyExists = corrections.some(
    (c: any) => c.book_id === book.id && c.chapter === chapter && c.verse === verse && c.old === oldWord
  );

  if (!alreadyExists) {
    corrections.push({
      book_id: book.id,
      chapter,
      verse,
      old: oldWord,
      new: newWord,
      date: today,
    });
    writeFileSync(CORRECTIONS_PATH, JSON.stringify(corrections, null, 2) + '\n', 'utf-8');
    console.log(`corrections.json에 추가됨 (총 ${corrections.length}건)`);
  }

  console.log('수정 완료!');

  rl.close();
  db.close();
}

main().catch(err => {
  console.error('오류:', err);
  process.exit(1);
});

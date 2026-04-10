/**
 * Unit tests for db/bible.ts — parseReference()
 * - 전체 이름 파싱
 * - 한국어 약어 파싱
 * - 장/절 접미사 처리
 * - 범위 검증 (챕터 수 초과)
 * - 중의적 책 이름 (longest-match-first)
 */

import { parseReference } from '../../db/bible';

describe('parseReference — 전체 책 이름', () => {
  test('요한복음 3:16', () => {
    const r = parseReference('요한복음 3:16');
    expect(r).toMatchObject({ bookId: 43, bookName: '요한복음', chapter: 3, verse: 16 });
  });

  test('창세기 1:1', () => {
    const r = parseReference('창세기 1:1');
    expect(r).toMatchObject({ bookId: 1, chapter: 1, verse: 1 });
  });

  test('요한계시록 22', () => {
    const r = parseReference('요한계시록 22');
    expect(r).toMatchObject({ bookId: 66, chapter: 22 });
    expect(r?.verse).toBeUndefined();
  });

  test('시편 119장', () => {
    const r = parseReference('시편 119장');
    expect(r).toMatchObject({ bookId: 19, chapter: 119 });
  });

  test('시편 119장 176절', () => {
    const r = parseReference('시편 119장 176절');
    expect(r).toMatchObject({ bookId: 19, chapter: 119, verse: 176 });
  });
});

describe('parseReference — 한국어 약어', () => {
  test('요 3 (요한복음)', () => {
    const r = parseReference('요 3');
    expect(r).toMatchObject({ bookId: 43, chapter: 3 });
  });

  test('요 3:16', () => {
    const r = parseReference('요 3:16');
    expect(r).toMatchObject({ bookId: 43, chapter: 3, verse: 16 });
  });

  test('고전 13:4 (고린도전서)', () => {
    const r = parseReference('고전 13:4');
    expect(r).toMatchObject({ bookId: 46, chapter: 13, verse: 4 });
  });

  test('창 1 (창세기)', () => {
    const r = parseReference('창 1');
    expect(r).toMatchObject({ bookId: 1, chapter: 1 });
  });

  test('요일 3:16 (요한일서, 요한복음과 구분)', () => {
    const r = parseReference('요일 3:16');
    expect(r).toMatchObject({ bookId: 62, chapter: 3, verse: 16 });
  });

  test('삼상 1장 (사무엘상)', () => {
    const r = parseReference('삼상 1장');
    expect(r).toMatchObject({ bookId: 9, chapter: 1 });
  });
});

describe('parseReference — 범위 검증', () => {
  test('챕터 0 → null', () => {
    expect(parseReference('요한복음 0')).toBeNull();
  });

  test('챕터 초과 (요한복음은 21장까지) → null', () => {
    expect(parseReference('요한복음 22')).toBeNull();
  });

  test('창세기 50장 → 유효 (50장까지 있음)', () => {
    const r = parseReference('창세기 50');
    expect(r).toMatchObject({ bookId: 1, chapter: 50 });
  });

  test('창세기 51장 → null', () => {
    expect(parseReference('창세기 51')).toBeNull();
  });
});

describe('parseReference — null 반환 케이스', () => {
  test('빈 문자열 → null', () => {
    expect(parseReference('')).toBeNull();
  });

  test('책 이름 없음 → null', () => {
    expect(parseReference('3:16')).toBeNull();
  });

  test('챕터 번호 없음 → null', () => {
    expect(parseReference('요한복음')).toBeNull();
  });

  test('숫자만 → null', () => {
    expect(parseReference('123')).toBeNull();
  });
});

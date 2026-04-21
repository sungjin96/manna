// SQLite mock
const dbStore: Record<string, Record<string, unknown>[]> = {};

const mockDb = {
  runAsync: jest.fn(async (sql: string, params: unknown[]) => {
    if (/INSERT OR IGNORE INTO bookmarks/.test(sql)) {
      const [book_id, chapter, verse, saved_at] = params as [number, number, number, string];
      const key = `${book_id}-${chapter}-${verse}`;
      if (!dbStore['bookmarks']) dbStore['bookmarks'] = [];
      const exists = dbStore['bookmarks'].some(r => r['book_id'] === book_id && r['chapter'] === chapter && r['verse'] === verse);
      if (!exists) dbStore['bookmarks'].push({ book_id, chapter, verse, saved_at });
    } else if (/DELETE FROM bookmarks/.test(sql)) {
      const [book_id, chapter, verse] = params as [number, number, number];
      dbStore['bookmarks'] = (dbStore['bookmarks'] || []).filter(
        r => !(r['book_id'] === book_id && r['chapter'] === chapter && r['verse'] === verse)
      );
    }
  }),
  getFirstAsync: jest.fn(async (sql: string, params: unknown[]) => {
    if (/COUNT.*bookmarks/.test(sql)) {
      const [book_id, chapter, verse] = params as [number, number, number];
      const count = (dbStore['bookmarks'] || []).filter(
        r => r['book_id'] === book_id && r['chapter'] === chapter && r['verse'] === verse
      ).length;
      return { count };
    }
    return null;
  }),
  getAllAsync: jest.fn(async (sql: string, params: unknown[]) => {
    if (/SELECT verse FROM bookmarks/.test(sql)) {
      const [book_id, chapter] = params as [number, number];
      return (dbStore['bookmarks'] || [])
        .filter(r => r['book_id'] === book_id && r['chapter'] === chapter)
        .map(r => ({ verse: r['verse'] }))
        .sort((a, b) => (a.verse as number) - (b.verse as number));
    }
    return [];
  }),
};

jest.mock('../../db/schema', () => ({
  getDb: jest.fn(() => Promise.resolve(mockDb)),
}));

import { saveBookmark, deleteBookmark, isBookmarked, getBookmarkedVerses } from '../../db/bookmarks';

beforeEach(() => {
  Object.keys(dbStore).forEach(k => delete dbStore[k]);
  jest.clearAllMocks();
});

describe('saveBookmark', () => {
  test('책갈피 저장', async () => {
    await saveBookmark(1, 3, 16);
    const result = await isBookmarked(1, 3, 16);
    expect(result).toBe(true);
  });

  test('중복 저장해도 에러 없음 (INSERT OR IGNORE)', async () => {
    await saveBookmark(1, 3, 16);
    await saveBookmark(1, 3, 16);
    const verses = await getBookmarkedVerses(1, 3);
    expect(verses).toHaveLength(1);
  });
});

describe('deleteBookmark', () => {
  test('책갈피 삭제', async () => {
    await saveBookmark(1, 3, 16);
    await deleteBookmark(1, 3, 16);
    const result = await isBookmarked(1, 3, 16);
    expect(result).toBe(false);
  });

  test('없는 책갈피 삭제해도 에러 없음', async () => {
    await expect(deleteBookmark(1, 3, 99)).resolves.not.toThrow();
  });
});

describe('isBookmarked', () => {
  test('없으면 false 반환', async () => {
    const result = await isBookmarked(1, 3, 1);
    expect(result).toBe(false);
  });

  test('있으면 true 반환', async () => {
    await saveBookmark(1, 3, 1);
    const result = await isBookmarked(1, 3, 1);
    expect(result).toBe(true);
  });
});

describe('getBookmarkedVerses', () => {
  test('챕터 내 책갈피 절 번호 목록 반환', async () => {
    await saveBookmark(1, 3, 5);
    await saveBookmark(1, 3, 16);
    await saveBookmark(1, 3, 2);
    const verses = await getBookmarkedVerses(1, 3);
    expect(verses).toEqual([2, 5, 16]); // 정렬된 순서
  });

  test('다른 챕터 책갈피는 포함되지 않음', async () => {
    await saveBookmark(1, 3, 16);
    await saveBookmark(1, 4, 8);
    const verses = await getBookmarkedVerses(1, 3);
    expect(verses).toEqual([16]);
  });

  test('책갈피 없으면 빈 배열', async () => {
    const verses = await getBookmarkedVerses(1, 1);
    expect(verses).toEqual([]);
  });
});

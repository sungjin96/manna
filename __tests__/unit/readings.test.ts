/**
 * DB layer tests for readings.ts
 * Uses a mock SQLite DB (no native module required)
 */

import {
  markChapterComplete,
  isChapterComplete,
  markVerseRead,
  unmarkVerseRead,
  getReadVerses,
  getAllCompletedChapters,
} from '../../db/readings';

// ── In-memory DB mock ────────────────────────────────────────────────────────

type ReadingRow = { id: number; book_id: number; chapter: number; completed_at: string };
type VerseRow = { book_id: number; chapter: number; verse: number; read_at: string };

function createMockDb() {
  let readingIdSeq = 1;
  const readings: ReadingRow[] = [];
  const verseReadings: VerseRow[] = [];

  return {
    _readings: readings,
    _verseReadings: verseReadings,

    async runAsync(sql: string, params: unknown[] = []) {
      if (sql.includes('INSERT OR IGNORE INTO readings')) {
        const [book_id, chapter, completed_at] = params as [number, number, string];
        const exists = readings.some(r => r.book_id === book_id && r.chapter === chapter);
        if (!exists) {
          readings.push({ id: readingIdSeq++, book_id, chapter, completed_at });
          return { changes: 1 };
        }
        return { changes: 0 };
      }
      if (sql.includes('INSERT OR IGNORE INTO verse_readings')) {
        const [book_id, chapter, verse, read_at] = params as [number, number, number, string];
        const exists = verseReadings.some(r => r.book_id === book_id && r.chapter === chapter && r.verse === verse);
        if (!exists) verseReadings.push({ book_id, chapter, verse, read_at });
        return { changes: 1 };
      }
      if (sql.includes('DELETE FROM verse_readings')) {
        const [book_id, chapter, verse] = params as [number, number, number];
        const idx = verseReadings.findIndex(r => r.book_id === book_id && r.chapter === chapter && r.verse === verse);
        if (idx >= 0) verseReadings.splice(idx, 1);
        return { changes: 1 };
      }
      return { changes: 0 };
    },

    async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      if (sql.includes('SELECT COUNT(*) as count FROM readings WHERE')) {
        const [book_id, chapter] = params as [number, number];
        const count = readings.filter(r => r.book_id === book_id && r.chapter === chapter).length;
        return { count } as unknown as T;
      }
      if (sql.includes('SELECT book_id, chapter FROM readings ORDER BY')) {
        const sorted = [...readings].sort((a, b) => b.completed_at.localeCompare(a.completed_at) || b.id - a.id);
        return sorted[0] ? { book_id: sorted[0].book_id, chapter: sorted[0].chapter } as unknown as T : undefined;
      }
      return undefined;
    },

    async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (sql.includes('SELECT verse FROM verse_readings WHERE')) {
        const [book_id, chapter] = params as [number, number];
        return verseReadings
          .filter(r => r.book_id === book_id && r.chapter === chapter)
          .map(r => ({ verse: r.verse })) as unknown as T[];
      }
      if (sql.includes('SELECT book_id, chapter FROM readings')) {
        return readings.map(r => ({ book_id: r.book_id, chapter: r.chapter })) as unknown as T[];
      }
      return [];
    },
  };
}

// Mock getDb and updateStatsOnComplete
let mockDb = createMockDb();
jest.mock('../../db/schema', () => ({
  getDb: jest.fn(() => Promise.resolve(mockDb)),
}));
jest.mock('../../db/stats', () => ({
  updateStatsOnComplete: jest.fn().mockResolvedValue(undefined),
}));

import { updateStatsOnComplete } from '../../db/stats';

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockDb = createMockDb();
  // Update the mock to return the new db instance
  const { getDb } = require('../../db/schema');
  (getDb as jest.Mock).mockResolvedValue(mockDb);
  jest.clearAllMocks();
  // Re-register updateStatsOnComplete mock after clearAllMocks
  (updateStatsOnComplete as jest.Mock).mockResolvedValue(undefined);
});

describe('markChapterComplete', () => {
  test('새 챕터 완료 시 DB에 삽입됨', async () => {
    await markChapterComplete(1, 1);
    expect(mockDb._readings).toHaveLength(1);
    expect(mockDb._readings[0]).toMatchObject({ book_id: 1, chapter: 1 });
  });

  test('새 챕터 완료 시 stats 업데이트 호출됨', async () => {
    await markChapterComplete(1, 1);
    expect(updateStatsOnComplete).toHaveBeenCalledTimes(1);
  });

  test('중복 완료 시 stats 업데이트 호출 안 됨 (INSERT OR IGNORE)', async () => {
    await markChapterComplete(1, 1);
    await markChapterComplete(1, 1); // duplicate
    expect(mockDb._readings).toHaveLength(1);
    expect(updateStatsOnComplete).toHaveBeenCalledTimes(1); // only once
  });

  test('다른 챕터는 각각 기록됨', async () => {
    await markChapterComplete(1, 1);
    await markChapterComplete(1, 2);
    await markChapterComplete(2, 1);
    expect(mockDb._readings).toHaveLength(3);
  });
});

describe('isChapterComplete', () => {
  test('미완료 챕터 → false', async () => {
    expect(await isChapterComplete(1, 1)).toBe(false);
  });

  test('완료된 챕터 → true', async () => {
    await markChapterComplete(1, 1);
    expect(await isChapterComplete(1, 1)).toBe(true);
  });

  test('같은 책 다른 챕터는 독립적', async () => {
    await markChapterComplete(1, 1);
    expect(await isChapterComplete(1, 2)).toBe(false);
  });
});

describe('markVerseRead / unmarkVerseRead / getReadVerses', () => {
  test('절 읽음 표시 후 조회됨', async () => {
    await markVerseRead(1, 1, 5);
    const result = await getReadVerses(1, 1);
    expect(result.has(5)).toBe(true);
  });

  test('여러 절 읽음 표시', async () => {
    await markVerseRead(1, 1, 1);
    await markVerseRead(1, 1, 3);
    await markVerseRead(1, 1, 5);
    const result = await getReadVerses(1, 1);
    expect(result).toEqual(new Set([1, 3, 5]));
  });

  test('읽음 취소 후 조회 안 됨', async () => {
    await markVerseRead(1, 1, 5);
    await unmarkVerseRead(1, 1, 5);
    const result = await getReadVerses(1, 1);
    expect(result.has(5)).toBe(false);
  });

  test('다른 챕터 절은 격리됨', async () => {
    await markVerseRead(1, 1, 5);
    const result = await getReadVerses(1, 2);
    expect(result.size).toBe(0);
  });

  test('중복 markVerseRead는 무시됨', async () => {
    await markVerseRead(1, 1, 5);
    await markVerseRead(1, 1, 5);
    const result = await getReadVerses(1, 1);
    expect(result.size).toBe(1);
  });
});

describe('getAllCompletedChapters', () => {
  test('완료된 챕터 Set 반환', async () => {
    await markChapterComplete(1, 1);
    await markChapterComplete(1, 2);
    await markChapterComplete(2, 1);
    const result = await getAllCompletedChapters();
    expect(result.has('1:1')).toBe(true);
    expect(result.has('1:2')).toBe(true);
    expect(result.has('2:1')).toBe(true);
    expect(result.has('2:2')).toBe(false);
  });

  test('완료 없으면 빈 Set', async () => {
    const result = await getAllCompletedChapters();
    expect(result.size).toBe(0);
  });
});

/**
 * DB layer tests for stats.ts
 * Verifies updateStatsOnComplete logic via a mock DB
 */

import { updateStatsOnComplete, getStats } from '../../db/stats';

// ── In-memory stats DB mock ──────────────────────────────────────────────────

type StatsRow = {
  id: number;
  current_streak: number;
  longest_streak: number;
  total_chapters: number;
  last_read_date: string | null;
};

function createMockStatsDb(initial?: Partial<StatsRow>) {
  const row: StatsRow = {
    id: 1,
    current_streak: 0,
    longest_streak: 0,
    total_chapters: 0,
    last_read_date: null,
    ...initial,
  };

  return {
    _row: row,
    async runAsync(sql: string, params: unknown[]) {
      if (sql.includes('UPDATE user_stats')) {
        const [newStreak, newLongest, newDate] = params as [number, number, string];
        row.current_streak = newStreak;
        row.longest_streak = newLongest;
        row.total_chapters += 1;
        row.last_read_date = newDate;
      }
      return { changes: 1 };
    },
    async getFirstAsync<T>(): Promise<T> {
      return {
        current_streak: row.current_streak,
        longest_streak: row.longest_streak,
        total_chapters: row.total_chapters,
        last_read_date: row.last_read_date,
      } as unknown as T;
    },
    // Transaction wrapper: just run the fn directly
    async withTransactionAsync(fn: () => Promise<void>) {
      await fn();
    },
  };
}

let mockDb = createMockStatsDb();
jest.mock('../../db/schema', () => ({
  getDb: jest.fn(() => Promise.resolve(mockDb)),
}));

beforeEach(() => {
  const { getDb } = require('../../db/schema');
  mockDb = createMockStatsDb();
  (getDb as jest.Mock).mockResolvedValue(mockDb);
});

describe('updateStatsOnComplete', () => {
  test('첫 완료: streak=1, total=1', async () => {
    await updateStatsOnComplete('2026-04-09');
    const stats = await getStats();
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(1);
    expect(stats.totalChapters).toBe(1);
    expect(stats.lastReadDate).toBe('2026-04-09');
  });

  test('같은 날 두 번째 챕터: streak 유지, total 증가', async () => {
    mockDb = createMockStatsDb({ current_streak: 3, longest_streak: 5, total_chapters: 10, last_read_date: '2026-04-09' });
    const { getDb } = require('../../db/schema');
    (getDb as jest.Mock).mockResolvedValue(mockDb);

    await updateStatsOnComplete('2026-04-09'); // same day
    const stats = await getStats();
    expect(stats.currentStreak).toBe(3); // unchanged
    expect(stats.totalChapters).toBe(11);
  });

  test('연속 읽기 (어제): streak +1', async () => {
    mockDb = createMockStatsDb({ current_streak: 4, longest_streak: 10, total_chapters: 20, last_read_date: '2026-04-08' });
    const { getDb } = require('../../db/schema');
    (getDb as jest.Mock).mockResolvedValue(mockDb);

    await updateStatsOnComplete('2026-04-09');
    const stats = await getStats();
    expect(stats.currentStreak).toBe(5);
    expect(stats.longestStreak).toBe(10); // unchanged
    expect(stats.totalChapters).toBe(21);
  });

  test('최장 스트릭 갱신', async () => {
    mockDb = createMockStatsDb({ current_streak: 10, longest_streak: 10, total_chapters: 50, last_read_date: '2026-04-08' });
    const { getDb } = require('../../db/schema');
    (getDb as jest.Mock).mockResolvedValue(mockDb);

    await updateStatsOnComplete('2026-04-09');
    const stats = await getStats();
    expect(stats.currentStreak).toBe(11);
    expect(stats.longestStreak).toBe(11);
  });

  test('스트릭 끊김 (하루 건너뜀): streak 리셋', async () => {
    mockDb = createMockStatsDb({ current_streak: 7, longest_streak: 15, total_chapters: 30, last_read_date: '2026-04-07' });
    const { getDb } = require('../../db/schema');
    (getDb as jest.Mock).mockResolvedValue(mockDb);

    await updateStatsOnComplete('2026-04-09'); // gap of 1 day
    const stats = await getStats();
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(15); // preserved
    expect(stats.totalChapters).toBe(31);
  });

  test('withTransactionAsync 호출됨 (동시성 보호)', async () => {
    const txSpy = jest.spyOn(mockDb, 'withTransactionAsync');
    await updateStatsOnComplete('2026-04-09');
    expect(txSpy).toHaveBeenCalledTimes(1);
  });
});

describe('getStats', () => {
  test('초기 stats 반환', async () => {
    const stats = await getStats();
    expect(stats).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      totalChapters: 0,
      lastReadDate: null,
    });
  });
});

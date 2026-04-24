/**
 * DB layer tests for stats.ts
 * Verifies updateStatsOnComplete and markDailyTouch logic via a mock DB
 */

import { updateStatsOnComplete, markDailyTouch, getStats } from '../../db/stats';

// ── In-memory stats DB mock ──────────────────────────────────────────────────

type StatsRow = {
  id: number;
  current_streak: number;
  longest_streak: number;
  total_chapters: number;
  last_read_date: string | null;
  freezes_remaining: number;
  freezes_month: string | null;
  comeback_count: number;
};

function createMockStatsDb(initial?: Partial<StatsRow>) {
  const row: StatsRow = {
    id: 1,
    current_streak: 0,
    longest_streak: 0,
    total_chapters: 0,
    last_read_date: null,
    freezes_remaining: 2,
    freezes_month: null,
    comeback_count: 0,
    ...initial,
  };

  return {
    _row: row,
    async runAsync(sql: string, params: unknown[]) {
      const s = sql.toLowerCase().replace(/\s+/g, ' ');

      // Freeze-only update (idempotent path: already read today)
      if (s.includes('set freezes_remaining = ?, freezes_month = ?')) {
        const [fr, fm] = params as [number, string | null];
        row.freezes_remaining = fr;
        row.freezes_month = fm;

      // Full streak update (main markDailyTouchInTx path)
      } else if (s.includes('current_streak = ?')) {
        const [ns, nl, lrd, fr, fm, cc] = params as [number, number, string, number, string | null, number];
        row.current_streak = ns;
        row.longest_streak = nl;
        row.last_read_date = lrd;
        row.freezes_remaining = fr;
        row.freezes_month = fm;
        row.comeback_count = cc;

      // Chapter count increment
      } else if (s.includes('total_chapters = total_chapters + 1')) {
        row.total_chapters += 1;
      }

      return { changes: 1 };
    },
    async getFirstAsync<T>(): Promise<T> {
      return { ...row } as unknown as T;
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      await fn();
    },
  };
}

let mockDb = createMockStatsDb();
jest.mock('../../db/schema', () => ({
  getDb: jest.fn(() => Promise.resolve(mockDb)),
}));

function resetDb(initial?: Partial<StatsRow>) {
  const { getDb } = require('../../db/schema');
  mockDb = createMockStatsDb(initial);
  (getDb as jest.Mock).mockResolvedValue(mockDb);
}

beforeEach(() => resetDb());

// ── updateStatsOnComplete ────────────────────────────────────────────────────

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
    resetDb({ current_streak: 3, longest_streak: 5, total_chapters: 10, last_read_date: '2026-04-09' });
    await updateStatsOnComplete('2026-04-09');
    const stats = await getStats();
    expect(stats.currentStreak).toBe(3);
    expect(stats.totalChapters).toBe(11);
  });

  test('연속 읽기 (어제): streak +1', async () => {
    resetDb({ current_streak: 4, longest_streak: 10, total_chapters: 20, last_read_date: '2026-04-08' });
    await updateStatsOnComplete('2026-04-09');
    const stats = await getStats();
    expect(stats.currentStreak).toBe(5);
    expect(stats.longestStreak).toBe(10);
    expect(stats.totalChapters).toBe(21);
  });

  test('최장 스트릭 갱신', async () => {
    resetDb({ current_streak: 10, longest_streak: 10, total_chapters: 50, last_read_date: '2026-04-08' });
    await updateStatsOnComplete('2026-04-09');
    const stats = await getStats();
    expect(stats.currentStreak).toBe(11);
    expect(stats.longestStreak).toBe(11);
  });

  test('스트릭 끊김 + freeze 0 → streak 리셋', async () => {
    // gap=2, freeze 없음 → streak 끊김 (freezes_month='2026-04'로 월 리셋 방지)
    resetDb({ current_streak: 7, longest_streak: 15, total_chapters: 30, last_read_date: '2026-04-07', freezes_remaining: 0, freezes_month: '2026-04' });
    await updateStatsOnComplete('2026-04-09');
    const stats = await getStats();
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(15);
    expect(stats.totalChapters).toBe(31);
  });

  test('withTransactionAsync 호출됨 (동시성 보호)', async () => {
    const txSpy = jest.spyOn(mockDb, 'withTransactionAsync');
    await updateStatsOnComplete('2026-04-09');
    expect(txSpy).toHaveBeenCalledTimes(1);
  });
});

// ── markDailyTouch ───────────────────────────────────────────────────────────

describe('markDailyTouch', () => {
  test('하루 첫 터치: streak+1, total_chapters 불변', async () => {
    resetDb({ current_streak: 5, longest_streak: 10, total_chapters: 30, last_read_date: '2026-04-08' });
    await markDailyTouch('2026-04-09');
    const stats = await getStats();
    expect(stats.currentStreak).toBe(6);
    expect(stats.totalChapters).toBe(30); // 변화 없음
  });

  test('같은 날 두 번째 터치: 불변 (idempotent)', async () => {
    resetDb({ current_streak: 3, longest_streak: 5, total_chapters: 10, last_read_date: '2026-04-09' });
    await markDailyTouch('2026-04-09');
    const stats = await getStats();
    expect(stats.currentStreak).toBe(3);
    expect(stats.totalChapters).toBe(10);
  });

  test('freeze 소비: gap=2 + freeze>=1 → streak 유지, freeze 1 감소', async () => {
    resetDb({ current_streak: 5, longest_streak: 10, last_read_date: '2026-04-07', freezes_remaining: 2, freezes_month: '2026-04' });
    await markDailyTouch('2026-04-09');
    const stats = await getStats();
    expect(stats.currentStreak).toBe(6); // freeze 소비 → gap=1 처리 → +1
    expect(stats.freezesRemaining).toBe(1); // 1 소비
  });

  test('freeze 없음: gap=2 → streak 리셋, comeback_count 증가', async () => {
    resetDb({ current_streak: 5, longest_streak: 10, last_read_date: '2026-04-07', freezes_remaining: 0, freezes_month: '2026-04' });
    await markDailyTouch('2026-04-09');
    const stats = await getStats();
    expect(stats.currentStreak).toBe(1);
    expect(stats.comebackCount).toBe(1);
  });

  test('freeze 있어도 gap>=3 → streak 리셋 (freeze는 1일 갭만 메움)', async () => {
    resetDb({ current_streak: 5, longest_streak: 10, last_read_date: '2026-04-06', freezes_remaining: 2, freezes_month: '2026-04' });
    await markDailyTouch('2026-04-09'); // gap=3
    const stats = await getStats();
    expect(stats.currentStreak).toBe(1);
    expect(stats.freezesRemaining).toBe(2); // 소비되지 않음
  });

  test('월 경계에서 freeze 리셋', async () => {
    resetDb({ current_streak: 1, longest_streak: 1, last_read_date: '2026-03-31', freezes_remaining: 0, freezes_month: '2026-03' });
    await markDailyTouch('2026-04-01');
    const stats = await getStats();
    // 월 리셋 → freezes=2 → gap=1(어제 읽음) → streak continues
    expect(stats.currentStreak).toBe(2);
    expect(stats.freezesMonth).toBe('2026-04');
    // 월 리셋 후에도 freeze는 gap=2일 때만 소비, gap=1이므로 소비 안 됨
    expect(stats.freezesRemaining).toBe(2);
  });
});

// ── getStats ─────────────────────────────────────────────────────────────────

describe('getStats', () => {
  test('초기 stats 반환 (새 필드 포함)', async () => {
    const stats = await getStats();
    expect(stats).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      totalChapters: 0,
      lastReadDate: null,
      freezesRemaining: 2,
      freezesMonth: null,
      comebackCount: 0,
    });
  });
});

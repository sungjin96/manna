import * as SQLite from 'expo-sqlite';
import { getDb } from './schema';
import { computeNewStreak, daysBetween, getPreviousDay } from '../utils/streak';

export interface UserStats {
  currentStreak: number;
  longestStreak: number;
  totalChapters: number;
  lastReadDate: string | null;
  freezesRemaining: number;
  freezesMonth: string | null;
  comebackCount: number;
}

export async function getStats(): Promise<UserStats> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    current_streak: number;
    longest_streak: number;
    total_chapters: number;
    last_read_date: string | null;
    freezes_remaining: number | null;
    freezes_month: string | null;
    comeback_count: number | null;
  }>(
    'SELECT current_streak, longest_streak, total_chapters, last_read_date, freezes_remaining, freezes_month, comeback_count FROM user_stats WHERE id = 1'
  );

  return {
    currentStreak: row?.current_streak ?? 0,
    longestStreak: row?.longest_streak ?? 0,
    totalChapters: row?.total_chapters ?? 0,
    lastReadDate: row?.last_read_date ?? null,
    freezesRemaining: row?.freezes_remaining ?? 2,
    freezesMonth: row?.freezes_month ?? null,
    comebackCount: row?.comeback_count ?? 0,
  };
}

/**
 * Freeze 소비 + streak 갱신 핵심 로직.
 * 반드시 기존 트랜잭션 안에서 호출해야 함.
 */
export async function markDailyTouchInTx(
  db: SQLite.SQLiteDatabase,
  today: string
): Promise<void> {
  const row = await db.getFirstAsync<{
    current_streak: number;
    longest_streak: number;
    last_read_date: string | null;
    freezes_remaining: number | null;
    freezes_month: string | null;
    comeback_count: number | null;
  }>(
    'SELECT current_streak, longest_streak, last_read_date, freezes_remaining, freezes_month, comeback_count FROM user_stats WHERE id = 1'
  );
  if (!row) return;

  let { current_streak, longest_streak } = row;
  let last_read_date = row.last_read_date;
  let freezes_remaining = row.freezes_remaining ?? 2;
  let freezes_month = row.freezes_month ?? null;
  let comeback_count = row.comeback_count ?? 0;

  // 월별 freeze 리셋
  const currentMonth = today.slice(0, 7);
  if (freezes_month !== currentMonth) {
    freezes_remaining = 2;
    freezes_month = currentMonth;
  }

  // 오늘 이미 읽음 — freeze 리셋만 저장하고 종료
  if (last_read_date === today) {
    await db.runAsync(
      'UPDATE user_stats SET freezes_remaining = ?, freezes_month = ? WHERE id = 1',
      [freezes_remaining, freezes_month]
    );
    return;
  }

  // Freeze 소비: gap === 2 && freeze 보유 → last_read_date를 yesterday로 당기기
  if (last_read_date) {
    const gap = daysBetween(last_read_date, today);
    if (gap === 2 && freezes_remaining >= 1) {
      freezes_remaining -= 1;
      last_read_date = getPreviousDay(today);
    } else if (gap >= 2 && current_streak > 0) {
      // 실제 스트릭 끊김 후 복귀
      comeback_count += 1;
    }
  }

  const { newStreak, newLongest } = computeNewStreak(
    current_streak,
    longest_streak,
    last_read_date,
    today
  );

  await db.runAsync(
    `UPDATE user_stats
     SET current_streak = ?, longest_streak = ?, last_read_date = ?,
         freezes_remaining = ?, freezes_month = ?, comeback_count = ?
     WHERE id = 1`,
    [newStreak, newLongest, today, freezes_remaining, freezes_month, comeback_count]
  );
}

export async function markDailyTouch(today: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(() => markDailyTouchInTx(db, today));
}

// Called after each markChapterComplete
export async function updateStatsOnComplete(today: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await markDailyTouchInTx(db, today);
    await db.runAsync(
      'UPDATE user_stats SET total_chapters = total_chapters + 1 WHERE id = 1'
    );
  });
}

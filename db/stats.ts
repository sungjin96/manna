import { getDb } from './schema';
import { computeNewStreak } from '../utils/streak';

export interface UserStats {
  currentStreak: number;
  longestStreak: number;
  totalChapters: number;
  lastReadDate: string | null;
}

export async function getStats(): Promise<UserStats> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    current_streak: number;
    longest_streak: number;
    total_chapters: number;
    last_read_date: string | null;
  }>('SELECT current_streak, longest_streak, total_chapters, last_read_date FROM user_stats WHERE id = 1');

  return {
    currentStreak: row?.current_streak ?? 0,
    longestStreak: row?.longest_streak ?? 0,
    totalChapters: row?.total_chapters ?? 0,
    lastReadDate: row?.last_read_date ?? null,
  };
}

// Called after each markChapterComplete
export async function updateStatsOnComplete(today: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const stats = await getStats();

    const { newStreak, newLongest } = computeNewStreak(
      stats.currentStreak,
      stats.longestStreak,
      stats.lastReadDate,
      today
    );

    const isNewDay = stats.lastReadDate !== today;
    await db.runAsync(
      `UPDATE user_stats
       SET current_streak = ?, longest_streak = ?, total_chapters = total_chapters + 1,
           last_read_date = ?
       WHERE id = 1`,
      [newStreak, newLongest, isNewDay ? today : stats.lastReadDate]
    );
  });
}

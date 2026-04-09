import { getDb } from './schema';
import { updateStatsOnComplete } from './stats';

export interface Reading {
  bookId: number;
  chapter: number;
  completedAt: string;
}

// Returns today's local date as YYYY-MM-DD
function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function markChapterComplete(bookId: number, chapter: number): Promise<void> {
  const db = await getDb();
  const today = todayLocal();
  await db.runAsync(
    'INSERT OR IGNORE INTO readings (book_id, chapter, completed_at) VALUES (?, ?, ?)',
    [bookId, chapter, today]
  );
  await updateStatsOnComplete(today);
}

export async function isChapterComplete(bookId: number, chapter: number): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM readings WHERE book_id = ? AND chapter = ?',
    [bookId, chapter]
  );
  return (row?.count ?? 0) > 0;
}

// Returns a Set of "bookId:chapter" strings for O(1) lookup in progress screen
export async function getAllCompletedChapters(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ book_id: number; chapter: number }>(
    'SELECT book_id, chapter FROM readings'
  );
  return new Set(rows.map(r => `${r.book_id}:${r.chapter}`));
}

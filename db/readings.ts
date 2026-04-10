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
  const result = await db.runAsync(
    'INSERT OR IGNORE INTO readings (book_id, chapter, completed_at) VALUES (?, ?, ?)',
    [bookId, chapter, today]
  );
  // Only update stats if the insert actually happened (not a duplicate)
  if (result.changes > 0) {
    await updateStatsOnComplete(today);
  }
}

export async function isChapterComplete(bookId: number, chapter: number): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM readings WHERE book_id = ? AND chapter = ?',
    [bookId, chapter]
  );
  return (row?.count ?? 0) > 0;
}

// Returns the last completed chapter position, or null if none
export async function getLastReadPosition(): Promise<{ bookId: number; chapter: number } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ book_id: number; chapter: number }>(
    'SELECT book_id, chapter FROM readings ORDER BY completed_at DESC, id DESC LIMIT 1'
  );
  return row ? { bookId: row.book_id, chapter: row.chapter } : null;
}

export async function markVerseRead(bookId: number, chapter: number, verse: number): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT OR IGNORE INTO verse_readings (book_id, chapter, verse, read_at) VALUES (?, ?, ?, ?)',
    [bookId, chapter, verse, now]
  );
}

export async function unmarkVerseRead(bookId: number, chapter: number, verse: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'DELETE FROM verse_readings WHERE book_id = ? AND chapter = ? AND verse = ?',
    [bookId, chapter, verse]
  );
}

export async function getReadVerses(bookId: number, chapter: number): Promise<Set<number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ verse: number }>(
    'SELECT verse FROM verse_readings WHERE book_id = ? AND chapter = ?',
    [bookId, chapter]
  );
  return new Set(rows.map(r => r.verse));
}

// Returns a Set of "bookId:chapter" strings for O(1) lookup in progress screen
export async function unmarkChapterComplete(bookId: number, chapter: number): Promise<void> {
  const db = await getDb();
  const result = await db.runAsync(
    'DELETE FROM readings WHERE book_id = ? AND chapter = ?',
    [bookId, chapter]
  );
  if (result.changes > 0) {
    // Decrement total_chapters (streak is not recalculated to avoid complexity)
    await db.runAsync(
      'UPDATE user_stats SET total_chapters = MAX(0, total_chapters - 1) WHERE id = 1'
    );
  }
}

export async function getAllCompletedChapters(): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ book_id: number; chapter: number }>(
    'SELECT book_id, chapter FROM readings'
  );
  return new Set(rows.map(r => `${r.book_id}:${r.chapter}`));
}

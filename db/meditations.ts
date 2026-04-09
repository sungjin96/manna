import { getDb } from './schema';

export interface Meditation {
  id: number;
  bookId: number;
  chapter: number;
  note: string;
  createdAt: string;
}

export async function saveMeditation(bookId: number, chapter: number, note: string): Promise<void> {
  if (note.length === 0 || note.length > 200) return;
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO meditations (book_id, chapter, note, created_at) VALUES (?, ?, ?, ?)',
    [bookId, chapter, note, now]
  );
}

export async function getMeditationsForChapter(bookId: number, chapter: number): Promise<Meditation[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number; book_id: number; chapter: number; note: string; created_at: string;
  }>(
    'SELECT id, book_id, chapter, note, created_at FROM meditations WHERE book_id = ? AND chapter = ? ORDER BY created_at DESC',
    [bookId, chapter]
  );
  return rows.map(r => ({
    id: r.id,
    bookId: r.book_id,
    chapter: r.chapter,
    note: r.note,
    createdAt: r.created_at,
  }));
}

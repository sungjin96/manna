import { getDb } from './schema';

export interface Meditation {
  id: number;
  bookId: number;
  chapter: number;
  note: string;
  createdAt: string;
  verseStart?: number;
  verseEnd?: number;
}

export async function saveMeditation(
  bookId: number,
  chapter: number,
  note: string,
  verseStart?: number,
  verseEnd?: number,
): Promise<void> {
  if (note.length === 0 || note.length > 200) return;
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO meditations (book_id, chapter, note, created_at, verse_start, verse_end) VALUES (?, ?, ?, ?, ?, ?)',
    [bookId, chapter, note, now, verseStart ?? null, verseEnd ?? null]
  );
}

export async function updateMeditation(id: number, note: string): Promise<void> {
  if (note.length === 0 || note.length > 200) return;
  const db = await getDb();
  await db.runAsync('UPDATE meditations SET note = ? WHERE id = ?', [note, id]);
}

export async function deleteMeditation(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM meditations WHERE id = ?', [id]);
}

function mapRow(r: {
  id: number; book_id: number; chapter: number; note: string;
  created_at: string; verse_start?: number | null; verse_end?: number | null;
}): Meditation {
  return {
    id: r.id,
    bookId: r.book_id,
    chapter: r.chapter,
    note: r.note,
    createdAt: r.created_at,
    verseStart: r.verse_start ?? undefined,
    verseEnd: r.verse_end ?? undefined,
  };
}

export async function getMeditationsForChapter(bookId: number, chapter: number): Promise<Meditation[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number; book_id: number; chapter: number; note: string;
    created_at: string; verse_start?: number | null; verse_end?: number | null;
  }>(
    'SELECT id, book_id, chapter, note, created_at, verse_start, verse_end FROM meditations WHERE book_id = ? AND chapter = ? ORDER BY created_at DESC',
    [bookId, chapter]
  );
  return rows.map(mapRow);
}

export async function getAllMeditations(): Promise<Meditation[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number; book_id: number; chapter: number; note: string;
    created_at: string; verse_start?: number | null; verse_end?: number | null;
  }>(
    'SELECT id, book_id, chapter, note, created_at, verse_start, verse_end FROM meditations ORDER BY created_at DESC'
  );
  return rows.map(mapRow);
}

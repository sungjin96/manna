import { getDb } from './schema';

export interface Verse {
  verse: number;
  text: string;
}

export async function getChapter(bookId: number, chapter: number): Promise<Verse[]> {
  const db = await getDb();
  return db.getAllAsync<Verse>(
    'SELECT verse, text FROM bible WHERE book_id = ? AND chapter = ? ORDER BY verse',
    [bookId, chapter]
  );
}

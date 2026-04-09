import { getDb } from './schema';

export interface Verse {
  verse: number;
  text: string;
}

export interface SearchResult {
  bookId: number;
  chapter: number;
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

export async function searchVerses(query: string, limit = 50): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const db = await getDb();
  // Use FTS5 with prefix matching (* suffix) and rank ordering
  const ftsQuery = `${trimmed}*`;
  try {
    return db.getAllAsync<SearchResult>(
      `SELECT b.book_id as bookId, b.chapter, b.verse, b.text
       FROM bible_fts f
       JOIN bible b ON b.id = f.rowid
       WHERE bible_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
      [ftsQuery, limit]
    );
  } catch {
    // Fallback: LIKE search if FTS5 isn't ready (e.g. first run before migration)
    return db.getAllAsync<SearchResult>(
      `SELECT book_id as bookId, chapter, verse, text
       FROM bible
       WHERE text LIKE ?
       LIMIT ?`,
      [`%${trimmed}%`, limit]
    );
  }
}

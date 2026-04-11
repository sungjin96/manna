import { getDb } from './schema';
import { BOOKS } from '../constants/books';

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

export interface BookReference {
  bookId: number;
  bookName: string;
  chapter: number;
  verse?: number;
}

// Korean standard abbreviations: abbrev → bookId
const ABBREV_MAP: Record<string, number> = {
  창: 1, 출: 2, 레: 3, 민: 4, 신: 5,
  수: 6, 삿: 7, 룻: 8, 삼상: 9, 삼하: 10,
  왕상: 11, 왕하: 12, 대상: 13, 대하: 14,
  스: 15, 느: 16, 에: 17, 욥: 18, 시: 19,
  잠: 20, 전: 21, 아: 22, 사: 23, 렘: 24,
  애: 25, 겔: 26, 단: 27, 호: 28, 욜: 29,
  암: 30, 옵: 31, 욘: 32, 미: 33, 나: 34,
  합: 35, 습: 36, 학: 37, 슥: 38, 말: 39,
  마: 40, 막: 41, 눅: 42, 요: 43, 행: 44,
  롬: 45, 고전: 46, 고후: 47, 갈: 48, 엡: 49,
  빌: 50, 골: 51, 살전: 52, 살후: 53,
  딤전: 54, 딤후: 55, 딛: 56, 몬: 57,
  히: 58, 약: 59, 벧전: 60, 벧후: 61,
  요일: 62, 요이: 63, 요삼: 64, 유: 65, 계: 66,
};

// Sorted by name length descending so longer matches win (e.g. "요한복음" before "요")
const NAME_ENTRIES: Array<[string, number]> = [
  ...BOOKS.map(b => [b.name, b.id] as [string, number]),
  ...Object.entries(ABBREV_MAP),
].sort((a, b) => b[0].length - a[0].length);

/**
 * Parses a query like "요 3:16", "창세기 1장", "요한복음 3장 16절" into a BookReference.
 * Returns null if the query doesn't look like a scripture reference.
 */
export function parseReference(query: string): BookReference | null {
  const q = query.trim();
  if (!q) return null;

  let bookId: number | undefined;
  let rest: string = q;

  for (const [name, id] of NAME_ENTRIES) {
    if (q.startsWith(name)) {
      bookId = id;
      rest = q.slice(name.length).trim();
      break;
    }
  }

  if (!bookId) return null;

  // rest should be like: "3", "3:16", "3장", "3장 16절", "3장16절"
  const match = rest.match(/^(\d+)(?:장)?(?:\s*[:\s]?\s*(\d+)절?)?$/);
  if (!match) return null;

  const chapter = parseInt(match[1], 10);
  const verse = match[2] ? parseInt(match[2], 10) : undefined;

  const book = BOOKS.find(b => b.id === bookId)!;
  if (chapter < 1 || chapter > book.chapters) return null;

  return { bookId, bookName: book.name, chapter, verse };
}

export async function getVerseRange(bookId: number, chapter: number, start: number, end: number): Promise<Verse[]> {
  const db = await getDb();
  return db.getAllAsync<Verse>(
    'SELECT verse, text FROM bible WHERE book_id = ? AND chapter = ? AND verse >= ? AND verse <= ? ORDER BY verse',
    [bookId, chapter, start, end]
  );
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

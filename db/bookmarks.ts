import { getDb } from './schema';

export interface Bookmark {
  book_id: number;
  chapter: number;
  verse: number;
  saved_at: string; // ISO 8601
}

/** 특정 구절 책갈피 저장. 이미 있으면 무시 (IGNORE). */
export async function saveBookmark(bookId: number, chapter: number, verse: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO bookmarks (book_id, chapter, verse, saved_at) VALUES (?, ?, ?, ?)`,
    [bookId, chapter, verse, new Date().toISOString()]
  );
}

/** 특정 구절 책갈피 삭제. */
export async function deleteBookmark(bookId: number, chapter: number, verse: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM bookmarks WHERE book_id = ? AND chapter = ? AND verse = ?`,
    [bookId, chapter, verse]
  );
}

/** 특정 구절이 책갈피인지 확인. */
export async function isBookmarked(bookId: number, chapter: number, verse: number): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM bookmarks WHERE book_id = ? AND chapter = ? AND verse = ?`,
    [bookId, chapter, verse]
  );
  return (row?.count ?? 0) > 0;
}

/** 챕터 내 책갈피된 절 번호 목록 반환. 챕터 진입 시 1회 로드용. */
export async function getBookmarkedVerses(bookId: number, chapter: number): Promise<number[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ verse: number }>(
    `SELECT verse FROM bookmarks WHERE book_id = ? AND chapter = ? ORDER BY verse`,
    [bookId, chapter]
  );
  return rows.map(r => r.verse);
}

/** 전체 책갈피 목록 (최신순). */
export async function getAllBookmarks(): Promise<Bookmark[]> {
  const db = await getDb();
  return db.getAllAsync<Bookmark>(
    `SELECT book_id, chapter, verse, saved_at FROM bookmarks ORDER BY saved_at DESC`
  );
}

export interface BookmarkWithText extends Bookmark {
  text: string;
}

/** 전체 책갈피 + 절 본문 JOIN (최신순). */
export async function getAllBookmarksWithText(): Promise<BookmarkWithText[]> {
  const db = await getDb();
  return db.getAllAsync<BookmarkWithText>(
    `SELECT b.book_id, b.chapter, b.verse, b.saved_at, bi.text
     FROM bookmarks b
     JOIN bible bi ON bi.book_id = b.book_id AND bi.chapter = b.chapter AND bi.verse = b.verse
     ORDER BY b.saved_at DESC`
  );
}

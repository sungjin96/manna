import { getDb } from './schema';

// Cache key: "{bookId}:{chapter}:{verseStart}-{verseEnd}" or "{bookId}:{chapter}:full"
function makeCacheKey(bookId: number, chapter: number, verseStart?: number, verseEnd?: number): string {
  if (verseStart != null && verseEnd != null) {
    return `${bookId}:${chapter}:${verseStart}-${verseEnd}`;
  }
  return `${bookId}:${chapter}:full`;
}

export async function getAICache(
  bookId: number,
  chapter: number,
  verseStart?: number,
  verseEnd?: number,
): Promise<string[] | null> {
  const db = await getDb();
  const key = makeCacheKey(bookId, chapter, verseStart, verseEnd);
  const row = await db.getFirstAsync<{ prompts: string }>(
    'SELECT prompts FROM ai_meditation_cache WHERE cache_key = ?',
    [key]
  );
  if (!row) return null;
  try {
    return JSON.parse(row.prompts);
  } catch {
    return null;
  }
}

export async function setAICache(
  bookId: number,
  chapter: number,
  prompts: string[],
  verseStart?: number,
  verseEnd?: number,
): Promise<void> {
  const db = await getDb();
  const key = makeCacheKey(bookId, chapter, verseStart, verseEnd);
  await db.runAsync(
    'INSERT OR REPLACE INTO ai_meditation_cache (cache_key, prompts, created_at) VALUES (?, ?, ?)',
    [key, JSON.stringify(prompts), new Date().toISOString()]
  );
}

import { getDb } from './schema';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const FREE_DAILY_AI_LIMIT = 3;
const PRO_DAILY_AI_LIMIT = 30;

export function getDailyAILimit(isPro: boolean): number {
  return isPro ? PRO_DAILY_AI_LIMIT : FREE_DAILY_AI_LIMIT;
}

type AIType = 'meditate' | 'explain' | 'prayer';

function makeCacheKey(type: AIType, bookId: number, chapter: number, verseStart?: number, verseEnd?: number): string {
  const range = verseStart != null && verseEnd != null
    ? `${verseStart}-${verseEnd}`
    : 'full';
  return `${type}:${bookId}:${chapter}:${range}`;
}

// ── 범용 캐시 get/set ─────────────────────────────────────────────────────────

export async function getAITypeCache<T>(
  type: AIType,
  bookId: number,
  chapter: number,
  verseStart?: number,
  verseEnd?: number,
): Promise<T | null> {
  const db = await getDb();
  const key = makeCacheKey(type, bookId, chapter, verseStart, verseEnd);
  const row = await db.getFirstAsync<{ data: string; created_at: string }>(
    'SELECT data, created_at FROM ai_cache WHERE cache_key = ?',
    [key]
  );
  if (!row) return null;

  const age = Date.now() - new Date(row.created_at).getTime();
  if (age > CACHE_TTL_MS) return null;

  try {
    return JSON.parse(row.data) as T;
  } catch {
    return null;
  }
}

export async function setAITypeCache<T>(
  type: AIType,
  bookId: number,
  chapter: number,
  data: T,
  verseStart?: number,
  verseEnd?: number,
): Promise<void> {
  const db = await getDb();
  const key = makeCacheKey(type, bookId, chapter, verseStart, verseEnd);
  await db.runAsync(
    'INSERT OR REPLACE INTO ai_cache (cache_key, data, created_at) VALUES (?, ?, ?)',
    [key, JSON.stringify(data), new Date().toISOString()]
  );
}

export async function clearAITypeCache(
  type: AIType,
  bookId: number,
  chapter: number,
  verseStart?: number,
  verseEnd?: number,
): Promise<void> {
  const db = await getDb();
  const key = makeCacheKey(type, bookId, chapter, verseStart, verseEnd);
  await db.runAsync('DELETE FROM ai_cache WHERE cache_key = ?', [key]);
}

// ── 하위 호환: meditate 캐시 (기존 chapter.tsx 호출부 대응) ──────────────────

export async function getAICache(
  bookId: number,
  chapter: number,
  verseStart?: number,
  verseEnd?: number,
): Promise<string[] | null> {
  return getAITypeCache<string[]>('meditate', bookId, chapter, verseStart, verseEnd);
}

export async function setAICache(
  bookId: number,
  chapter: number,
  prompts: string[],
  verseStart?: number,
  verseEnd?: number,
): Promise<void> {
  return setAITypeCache('meditate', bookId, chapter, prompts, verseStart, verseEnd);
}

// ── 일일 새로고침 카운터 ───────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function getDailyRefreshCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT count FROM ai_daily_refresh WHERE date = ?',
    [todayStr()]
  );
  return row?.count ?? 0;
}

export async function incrementDailyRefresh(): Promise<number> {
  const db = await getDb();
  const today = todayStr();
  await db.runAsync(
    `INSERT INTO ai_daily_refresh (date, count) VALUES (?, 1)
     ON CONFLICT(date) DO UPDATE SET count = count + 1`,
    [today]
  );
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT count FROM ai_daily_refresh WHERE date = ?',
    [today]
  );
  return row?.count ?? 1;
}

export { FREE_DAILY_AI_LIMIT, PRO_DAILY_AI_LIMIT };

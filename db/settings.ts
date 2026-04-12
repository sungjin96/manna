import { getDb } from './schema';

export async function getSetting(key: string, defaultValue: string): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key]
  );
  return row?.value ?? defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}

export async function getLastOpenedPosition(): Promise<{ bookId: number; chapter: number } | null> {
  try {
    const raw = await getSetting('last_opened_position', '');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.bookId === 'number' && typeof parsed.chapter === 'number') {
      return { bookId: parsed.bookId, chapter: parsed.chapter };
    }
    return null;
  } catch {
    return null;
  }
}

export async function setLastOpenedPosition(bookId: number, chapter: number): Promise<void> {
  try {
    await setSetting('last_opened_position', JSON.stringify({ bookId, chapter }));
  } catch {
    // fire-and-forget — 읽기 흐름 차단 금지
  }
}

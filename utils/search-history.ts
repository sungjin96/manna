import { getSetting, setSetting } from '../db/settings';

const KEY = 'search_history';
const MAX = 8;

export async function getSearchHistory(): Promise<string[]> {
  try {
    const raw = await getSetting(KEY, '[]');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function addSearchHistory(query: string): Promise<void> {
  const q = query.trim();
  if (!q) return;
  const history = await getSearchHistory();
  const filtered = history.filter(h => h !== q);
  const updated = [q, ...filtered].slice(0, MAX);
  await setSetting(KEY, JSON.stringify(updated));
}

export async function removeSearchHistory(query: string): Promise<string[]> {
  const history = await getSearchHistory();
  const updated = history.filter(h => h !== query);
  await setSetting(KEY, JSON.stringify(updated));
  return updated;
}

export async function clearSearchHistory(): Promise<void> {
  await setSetting(KEY, '[]');
}

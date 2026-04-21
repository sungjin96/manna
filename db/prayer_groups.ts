import { getDb } from './schema';

export interface PrayerGroup {
  id: number;
  name: string;
  order_idx: number;
  created_at: string;
}

export async function getPrayerGroups(): Promise<PrayerGroup[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PrayerGroup>(
    'SELECT id, name, order_idx, created_at FROM prayer_groups ORDER BY order_idx ASC, id ASC'
  );
  return rows;
}

export async function createPrayerGroup(name: string): Promise<PrayerGroup> {
  const db = await getDb();
  const maxRow = await db.getFirstAsync<{ max: number | null }>(
    'SELECT MAX(order_idx) as max FROM prayer_groups'
  );
  const nextIdx = (maxRow?.max ?? -1) + 1;
  const now = new Date().toISOString();
  const result = await db.runAsync(
    'INSERT INTO prayer_groups (name, order_idx, created_at) VALUES (?, ?, ?)',
    [name.trim(), nextIdx, now]
  );
  return { id: result.lastInsertRowId, name: name.trim(), order_idx: nextIdx, created_at: now };
}

export async function renamePrayerGroup(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE prayer_groups SET name = ? WHERE id = ?', [name.trim(), id]);
}

/**
 * 그룹 삭제 — 속한 기도제목의 prayer_group_id는 NULL로 초기화 (기도제목 자체는 유지).
 */
export async function deletePrayerGroup(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE meditations SET prayer_group_id = NULL WHERE prayer_group_id = ?', [id]);
  await db.runAsync('DELETE FROM prayer_groups WHERE id = ?', [id]);
}

/**
 * 그룹 순서 재정렬 — ids 배열 순서대로 order_idx 업데이트.
 */
export async function reorderGroups(ids: number[]): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < ids.length; i++) {
    await db.runAsync('UPDATE prayer_groups SET order_idx = ? WHERE id = ?', [i, ids[i]]);
  }
}

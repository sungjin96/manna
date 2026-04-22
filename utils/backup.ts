import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getDb } from '../db/schema';

const CURRENT_BACKUP_VERSION = 1;

export interface BackupData {
  version: number;
  schemaVersion: number;
  exportedAt: string;
  readings: Array<{ bookId: number; chapter: number; completedAt: string }>;
  meditations: Array<{
    bookId: number;
    chapter: number;
    note: string;
    createdAt: string;
    verseStart?: number;
    verseEnd?: number;
    prayerGroupId?: number | null;
  }>;
  userStats: {
    currentStreak: number;
    longestStreak: number;
    totalChapters: number;
    lastReadDate: string | null;
  } | null;
  appSettings: Array<{ key: string; value: string }>;
  verseReadings: Array<{ bookId: number; chapter: number; verse: number; readAt: string }>;
  aiCache: Array<{ cacheKey: string; data: string; createdAt: string }>;
  bookmarks?: Array<{ bookId: number; chapter: number; verse: number; savedAt: string }>;
  prayerGroups?: Array<{ id: number; name: string; orderIdx: number; createdAt: string }>;
}

export type BackupError =
  | 'export_failed'
  | 'sharing_unavailable'
  | 'pick_cancelled'
  | 'read_failed'
  | 'invalid_format'
  | 'schema_mismatch'
  | 'version_downgrade'
  | 'import_failed';

export interface VersionMeta {
  backupSchemaVersion: number;
  currentSchemaVersion: number;
  missingTables: string[];
}

export interface BackupResult<T> {
  data: T | null;
  error: BackupError | null;
  versionMeta?: VersionMeta;
  pendingBackup?: BackupData;
}

// ── Export ───────────────────────────────────────────────────────────────────

export async function exportToJSON(): Promise<BackupResult<void>> {
  try {
    const db = await getDb();

    // Read actual schema version from DB — never hardcode
    const { user_version: schemaVersion } = await db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version'
    ) ?? { user_version: 0 };

    const readings = await db.getAllAsync<{
      book_id: number; chapter: number; completed_at: string;
    }>('SELECT book_id, chapter, completed_at FROM readings ORDER BY completed_at');

    const meditations = await db.getAllAsync<{
      book_id: number; chapter: number; note: string; created_at: string;
      verse_start: number | null; verse_end: number | null; prayer_group_id: number | null;
    }>('SELECT book_id, chapter, note, created_at, verse_start, verse_end, prayer_group_id FROM meditations ORDER BY created_at');

    const statsRow = await db.getFirstAsync<{
      current_streak: number; longest_streak: number;
      total_chapters: number; last_read_date: string | null;
    }>('SELECT current_streak, longest_streak, total_chapters, last_read_date FROM user_stats WHERE id = 1');

    const settings = await db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM app_settings'
    );

    const verseReadings = await db.getAllAsync<{
      book_id: number; chapter: number; verse: number; read_at: string;
    }>('SELECT book_id, chapter, verse, read_at FROM verse_readings ORDER BY read_at');

    const aiCache = await db.getAllAsync<{
      cache_key: string; data: string; created_at: string;
    }>('SELECT cache_key, data, created_at FROM ai_cache');

    const bookmarks = await db.getAllAsync<{
      book_id: number; chapter: number; verse: number; saved_at: string;
    }>('SELECT book_id, chapter, verse, saved_at FROM bookmarks ORDER BY saved_at').catch(() => []);

    const prayerGroups = await db.getAllAsync<{
      id: number; name: string; order_idx: number; created_at: string;
    }>('SELECT id, name, order_idx, created_at FROM prayer_groups ORDER BY order_idx').catch(() => []);

    const payload: BackupData = {
      version: CURRENT_BACKUP_VERSION,
      schemaVersion,
      exportedAt: new Date().toISOString(),
      readings: readings.map(r => ({
        bookId: r.book_id,
        chapter: r.chapter,
        completedAt: r.completed_at,
      })),
      meditations: meditations.map(m => ({
        bookId: m.book_id,
        chapter: m.chapter,
        note: m.note,
        createdAt: m.created_at,
        ...(m.verse_start != null && { verseStart: m.verse_start }),
        ...(m.verse_end != null && { verseEnd: m.verse_end }),
        ...(m.prayer_group_id != null && { prayerGroupId: m.prayer_group_id }),
      })),
      userStats: statsRow ? {
        currentStreak: statsRow.current_streak,
        longestStreak: statsRow.longest_streak,
        totalChapters: statsRow.total_chapters,
        lastReadDate: statsRow.last_read_date,
      } : null,
      appSettings: settings,
      verseReadings: verseReadings.map(v => ({
        bookId: v.book_id,
        chapter: v.chapter,
        verse: v.verse,
        readAt: v.read_at,
      })),
      aiCache: aiCache.map(c => ({
        cacheKey: c.cache_key,
        data: c.data,
        createdAt: c.created_at,
      })),
      bookmarks: bookmarks.map(b => ({
        bookId: b.book_id,
        chapter: b.chapter,
        verse: b.verse,
        savedAt: b.saved_at,
      })),
      prayerGroups: prayerGroups.map(g => ({
        id: g.id,
        name: g.name,
        orderIdx: g.order_idx,
        createdAt: g.created_at,
      })),
    };

    const json = JSON.stringify(payload, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `manna-backup-${date}.json`;
    const fileUri = FileSystem.cacheDirectory + fileName;

    await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return { data: null, error: 'sharing_unavailable' };
    }

    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Manna 백업 저장',
      UTI: 'public.json',
    });

    return { data: null, error: null };
  } catch {
    return { data: null, error: 'export_failed' };
  }
}

// ── Import ───────────────────────────────────────────────────────────────────

export async function importFromJSON(): Promise<BackupResult<{ counts: string }>> {
  // Step 1: pick file
  let fileUri: string;
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });
    if (result.canceled) {
      return { data: null, error: 'pick_cancelled' };
    }
    fileUri = result.assets[0].uri;
  } catch {
    return { data: null, error: 'pick_cancelled' };
  }

  // Step 2: read and parse
  let backup: BackupData;
  try {
    const raw = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    backup = JSON.parse(raw);
  } catch {
    return { data: null, error: 'read_failed' };
  }

  // Step 3: validate structure
  if (
    typeof backup !== 'object' ||
    backup.version !== CURRENT_BACKUP_VERSION ||
    !Array.isArray(backup.readings) ||
    !Array.isArray(backup.meditations)
  ) {
    return { data: null, error: 'invalid_format' };
  }

  const db = await getDb();
  const { user_version: currentSchemaVersion } = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  ) ?? { user_version: 0 };

  // Step 4: schema version check
  if (backup.schemaVersion && backup.schemaVersion > currentSchemaVersion) {
    return { data: null, error: 'schema_mismatch' };
  }

  // Step 5: older backup — surface missing tables so UI can warn
  if (backup.schemaVersion && backup.schemaVersion < currentSchemaVersion) {
    const missingTables: string[] = [];
    if (!Array.isArray(backup.bookmarks)) missingTables.push('책갈피');
    if (!Array.isArray(backup.prayerGroups)) missingTables.push('기도제목 그룹');

    if (missingTables.length > 0) {
      return {
        data: null,
        error: 'version_downgrade',
        versionMeta: {
          backupSchemaVersion: backup.schemaVersion,
          currentSchemaVersion,
          missingTables,
        },
        pendingBackup: backup,
      };
    }
  }

  return _doImport(backup);
}

// Called by UI after user confirms the version-downgrade warning
export async function confirmImport(backup: BackupData): Promise<BackupResult<{ counts: string }>> {
  return _doImport(backup);
}

async function _doImport(backup: BackupData): Promise<BackupResult<{ counts: string }>> {
  try {
    const db = await getDb();

    await db.withTransactionAsync(async () => {
      // Clear all user data (preserve bible content)
      await db.runAsync('DELETE FROM readings');
      await db.runAsync('DELETE FROM meditations');
      await db.runAsync('DELETE FROM verse_readings');
      await db.runAsync('DELETE FROM ai_cache');
      await db.runAsync('DELETE FROM user_stats');
      await db.runAsync('DELETE FROM bookmarks');
      await db.runAsync('DELETE FROM prayer_groups');
      await db.runAsync('INSERT OR IGNORE INTO user_stats (id) VALUES (1)');

      // Restore prayer_groups first (meditations reference them)
      if (Array.isArray(backup.prayerGroups)) {
        for (const g of backup.prayerGroups) {
          await db.runAsync(
            'INSERT OR IGNORE INTO prayer_groups (id, name, order_idx, created_at) VALUES (?, ?, ?, ?)',
            [g.id, g.name, g.orderIdx, g.createdAt]
          );
        }
      }

      // Restore readings
      for (const r of backup.readings) {
        await db.runAsync(
          'INSERT OR IGNORE INTO readings (book_id, chapter, completed_at) VALUES (?, ?, ?)',
          [r.bookId, r.chapter, r.completedAt]
        );
      }

      // Restore meditations
      for (const m of backup.meditations) {
        await db.runAsync(
          'INSERT INTO meditations (book_id, chapter, note, created_at, verse_start, verse_end, prayer_group_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [m.bookId, m.chapter, m.note, m.createdAt, m.verseStart ?? null, m.verseEnd ?? null, m.prayerGroupId ?? null]
        );
      }

      // Restore user_stats
      if (backup.userStats) {
        const s = backup.userStats;
        await db.runAsync(
          'UPDATE user_stats SET current_streak=?, longest_streak=?, total_chapters=?, last_read_date=? WHERE id=1',
          [s.currentStreak, s.longestStreak, s.totalChapters, s.lastReadDate]
        );
      }

      // Restore app_settings
      if (Array.isArray(backup.appSettings)) {
        for (const { key, value } of backup.appSettings) {
          await db.runAsync(
            'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
            [key, value]
          );
        }
      }

      // Restore verse_readings
      if (Array.isArray(backup.verseReadings)) {
        for (const v of backup.verseReadings) {
          await db.runAsync(
            'INSERT OR IGNORE INTO verse_readings (book_id, chapter, verse, read_at) VALUES (?, ?, ?, ?)',
            [v.bookId, v.chapter, v.verse, v.readAt]
          );
        }
      }

      // Restore AI cache
      if (Array.isArray(backup.aiCache)) {
        for (const c of backup.aiCache) {
          await db.runAsync(
            'INSERT OR REPLACE INTO ai_cache (cache_key, data, created_at) VALUES (?, ?, ?)',
            [c.cacheKey, c.data, c.createdAt]
          );
        }
      }

      // Restore bookmarks
      if (Array.isArray(backup.bookmarks)) {
        for (const b of backup.bookmarks) {
          await db.runAsync(
            'INSERT OR IGNORE INTO bookmarks (book_id, chapter, verse, saved_at) VALUES (?, ?, ?, ?)',
            [b.bookId, b.chapter, b.verse, b.savedAt]
          );
        }
      }
    });

    const counts = `읽기 ${backup.readings.length}개, 묵상 ${backup.meditations.length}개 복원 완료`;
    return { data: { counts }, error: null };
  } catch {
    return { data: null, error: 'import_failed' };
  }
}

export function backupErrorMessage(error: BackupError): string {
  switch (error) {
    case 'export_failed':       return '내보내기 중 오류가 발생했습니다.';
    case 'sharing_unavailable': return '파일 공유를 지원하지 않는 기기입니다.';
    case 'pick_cancelled':      return '';
    case 'read_failed':         return '파일을 읽을 수 없습니다. JSON 파일인지 확인해주세요.';
    case 'invalid_format':      return '유효하지 않은 백업 파일입니다.';
    case 'schema_mismatch':     return '이 백업은 더 최신 버전의 앱에서 만들어졌습니다. 앱을 업데이트해주세요.';
    case 'version_downgrade':   return '이 백업은 이전 버전에서 만들어졌습니다.';
    case 'import_failed':       return '가져오기 중 오류가 발생했습니다. 다시 시도해주세요.';
  }
}

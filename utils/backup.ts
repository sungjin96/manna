import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getDb } from '../db/schema';

// Current schema version — must match PRAGMA user_version in schema.ts
const CURRENT_SCHEMA_VERSION = 5;

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
  }>;
  userStats: {
    currentStreak: number;
    longestStreak: number;
    totalChapters: number;
    lastReadDate: string | null;
  } | null;
  appSettings: Array<{ key: string; value: string }>;
  verseReadings: Array<{ bookId: number; chapter: number; verse: number; readAt: string }>;
  aiMeditationCache: Array<{ cacheKey: string; prompts: string; createdAt: string }>;
}

export type BackupError =
  | 'export_failed'
  | 'sharing_unavailable'
  | 'pick_cancelled'
  | 'read_failed'
  | 'invalid_format'
  | 'schema_mismatch'
  | 'import_failed';

export interface BackupResult<T> {
  data: T | null;
  error: BackupError | null;
}

// ── Export ───────────────────────────────────────────────────────────────────

export async function exportToJSON(): Promise<BackupResult<void>> {
  try {
    const db = await getDb();

    const readings = await db.getAllAsync<{
      book_id: number; chapter: number; completed_at: string;
    }>('SELECT book_id, chapter, completed_at FROM readings ORDER BY completed_at');

    const meditations = await db.getAllAsync<{
      book_id: number; chapter: number; note: string; created_at: string;
      verse_start: number | null; verse_end: number | null;
    }>('SELECT book_id, chapter, note, created_at, verse_start, verse_end FROM meditations ORDER BY created_at');

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
      cache_key: string; prompts: string; created_at: string;
    }>('SELECT cache_key, prompts, created_at FROM ai_meditation_cache');

    const payload: BackupData = {
      version: 1,
      schemaVersion: CURRENT_SCHEMA_VERSION,
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
      aiMeditationCache: aiCache.map(c => ({
        cacheKey: c.cache_key,
        prompts: c.prompts,
        createdAt: c.created_at,
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
    backup.version !== 1 ||
    !Array.isArray(backup.readings) ||
    !Array.isArray(backup.meditations)
  ) {
    return { data: null, error: 'invalid_format' };
  }

  // Step 4: schema version check (warn, don't block)
  if (backup.schemaVersion && backup.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { data: null, error: 'schema_mismatch' };
  }

  // Step 5: import in a single transaction (rollback on any failure)
  try {
    const db = await getDb();

    await db.withTransactionAsync(async () => {
      // Clear all user data (preserve bible content)
      await db.runAsync('DELETE FROM readings');
      await db.runAsync('DELETE FROM meditations');
      await db.runAsync('DELETE FROM verse_readings');
      await db.runAsync('DELETE FROM ai_meditation_cache');
      await db.runAsync('DELETE FROM user_stats');
      await db.runAsync('INSERT OR IGNORE INTO user_stats (id) VALUES (1)');

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
          'INSERT INTO meditations (book_id, chapter, note, created_at, verse_start, verse_end) VALUES (?, ?, ?, ?, ?, ?)',
          [m.bookId, m.chapter, m.note, m.createdAt, m.verseStart ?? null, m.verseEnd ?? null]
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
      if (Array.isArray(backup.aiMeditationCache)) {
        for (const c of backup.aiMeditationCache) {
          await db.runAsync(
            'INSERT OR REPLACE INTO ai_meditation_cache (cache_key, prompts, created_at) VALUES (?, ?, ?)',
            [c.cacheKey, c.prompts, c.createdAt]
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
    case 'export_failed':      return '내보내기 중 오류가 발생했습니다.';
    case 'sharing_unavailable': return '파일 공유를 지원하지 않는 기기입니다.';
    case 'pick_cancelled':     return '';
    case 'read_failed':        return '파일을 읽을 수 없습니다. JSON 파일인지 확인해주세요.';
    case 'invalid_format':     return '유효하지 않은 백업 파일입니다.';
    case 'schema_mismatch':    return '이 백업은 더 최신 버전의 앱에서 만들어졌습니다. 앱을 업데이트해주세요.';
    case 'import_failed':      return '가져오기 중 오류가 발생했습니다. 다시 시도해주세요.';
  }
}

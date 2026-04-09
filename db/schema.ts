import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

const DB_NAME = 'manna.db';

let _db: SQLite.SQLiteDatabase | null = null;
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (_dbPromise) return _dbPromise;
  _dbPromise = _initDb();
  return _dbPromise;
}

async function _initDb(): Promise<SQLite.SQLiteDatabase> {
  // Open first — expo-sqlite creates the file at its own internal location.
  // We use databasePath to find that location instead of guessing the path.
  _db = await SQLite.openDatabaseAsync(DB_NAME);

  // Check if the KorRV bible data is present.
  // An empty DB means the bundled file was never copied here.
  const tableCheck = await _db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='bible'"
  );
  const bibleTableExists = (tableCheck?.count ?? 0) > 0;

  let needsRestore = !bibleTableExists;
  if (bibleTableExists && !needsRestore) {
    const verseCheck = await _db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM bible'
    );
    if ((verseCheck?.count ?? 0) === 0) needsRestore = true;
  }

  if (needsRestore) {
    // Get the exact path expo-sqlite is using, close, replace with bundled DB.
    const actualPath = _db.databasePath;
    await _db.closeAsync();
    _db = null;

    const asset = Asset.fromModule(require('../assets/manna.db'));
    await asset.downloadAsync();
    await FileSystem.deleteAsync(actualPath, { idempotent: true });
    await FileSystem.copyAsync({ from: asset.localUri!, to: actualPath });

    _db = await SQLite.openDatabaseAsync(DB_NAME);
  }

  await migrate(_db);
  return _db;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');

  const { user_version } = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  ) ?? { user_version: 0 };

  // v0 → v1: initial schema
  if (user_version < 1) {
    await db.execAsync(`
      -- Bible content (read-only, imported from bundled DB)
      CREATE TABLE IF NOT EXISTS bible (
        id        INTEGER PRIMARY KEY,
        book_id   INTEGER NOT NULL,
        chapter   INTEGER NOT NULL,
        verse     INTEGER NOT NULL,
        text      TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bible_book_chapter ON bible (book_id, chapter);

      -- Reading completion log
      -- One row per chapter completed
      CREATE TABLE IF NOT EXISTS readings (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id      INTEGER NOT NULL,
        chapter      INTEGER NOT NULL,
        completed_at TEXT    NOT NULL,  -- ISO 8601 date string (YYYY-MM-DD)
        UNIQUE (book_id, chapter)       -- can only complete a chapter once
      );
      CREATE INDEX IF NOT EXISTS idx_readings_date ON readings (completed_at);

      -- Meditation notes tied to a reading session
      -- Multiple notes allowed per chapter (phase 2: edit/delete)
      CREATE TABLE IF NOT EXISTS meditations (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id      INTEGER NOT NULL,
        chapter      INTEGER NOT NULL,
        note         TEXT    NOT NULL CHECK (length(note) <= 200),
        created_at   TEXT    NOT NULL   -- ISO 8601 datetime
      );

      -- Aggregated stats for O(1) home screen reads
      -- Single row, updated on each chapter completion
      CREATE TABLE IF NOT EXISTS user_stats (
        id              INTEGER PRIMARY KEY CHECK (id = 1),
        current_streak  INTEGER NOT NULL DEFAULT 0,
        longest_streak  INTEGER NOT NULL DEFAULT 0,
        total_chapters  INTEGER NOT NULL DEFAULT 0,
        last_read_date  TEXT                          -- YYYY-MM-DD or NULL
      );
      INSERT OR IGNORE INTO user_stats (id) VALUES (1);

      PRAGMA user_version = 1;
    `);
  }

  // v1 → v2: app settings key-value store
  if (user_version < 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT OR IGNORE INTO app_settings (key, value) VALUES ('notification_enabled', '0');
      INSERT OR IGNORE INTO app_settings (key, value) VALUES ('notification_hour', '8');
      INSERT OR IGNORE INTO app_settings (key, value) VALUES ('notification_minute', '0');
      PRAGMA user_version = 2;
    `);
  }
}

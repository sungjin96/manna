import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

const DB_NAME = 'manna.db';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;

  // First launch: copy bundled bible.db from assets to writable location
  const dbPath = FileSystem.documentDirectory + DB_NAME;
  const { exists } = await FileSystem.getInfoAsync(dbPath);

  if (!exists) {
    const asset = Asset.fromModule(require('../assets/manna.db'));
    await asset.downloadAsync();
    await FileSystem.copyAsync({
      from: asset.localUri!,
      to: dbPath,
    });
  }

  _db = await SQLite.openDatabaseAsync(DB_NAME);
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

  // v1 → v2 (Phase 2): XP, badge columns
  // if (user_version < 2) {
  //   await db.execAsync(`
  //     ALTER TABLE user_stats ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
  //     ALTER TABLE user_stats ADD COLUMN level INTEGER NOT NULL DEFAULT 1;
  //     PRAGMA user_version = 2;
  //   `);
  // }
}

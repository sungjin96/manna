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
  // 로컬 변수로 작업 — _db는 migrate()까지 완전히 끝난 뒤에만 할당.
  // migrate() 완료 전에 getDb()가 _db를 반환하면 테이블이 없는 상태로 쿼리가 실행되는
  // 레이스 컨디션을 방지한다.
  const db = await SQLite.openDatabaseAsync(DB_NAME);

  // Check if the KorRV bible data is present.
  const tableCheck = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='bible'"
  );
  const bibleTableExists = (tableCheck?.count ?? 0) > 0;

  let needsRestore = !bibleTableExists;
  if (bibleTableExists && !needsRestore) {
    const verseCheck = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM bible'
    );
    if ((verseCheck?.count ?? 0) === 0) needsRestore = true;
  }

  if (needsRestore) {
    const asset = Asset.fromModule(require('../assets/manna.db'));
    await asset.downloadAsync();

    if (!asset.localUri) throw new Error('manna.db asset localUri is null after downloadAsync');

    const seedPath = (FileSystem.documentDirectory ?? '') + 'manna_seed.db';

    // 개발 모드에서 asset.localUri가 HTTP URL일 수 있음 — copyAsync는 HTTP 미지원
    if (asset.localUri.startsWith('http://') || asset.localUri.startsWith('https://')) {
      console.log('[DB seed] HTTP asset URI, using downloadAsync');
      const result = await FileSystem.downloadAsync(asset.localUri, seedPath);
      if (result.status !== 200) throw new Error(`Asset download failed: HTTP ${result.status}`);
    } else {
      await FileSystem.copyAsync({ from: asset.localUri, to: seedPath });
    }

    // expo-sqlite는 documentDirectory/SQLite/ 에 DB를 저장한다.
    // PRAGMA database_list 경로는 /private/var/... 로 시작해 FileSystem이 쓰기 거부함.
    // documentDirectory 기반 경로를 직접 사용해야 한다.
    const sqliteDirUri = (FileSystem.documentDirectory ?? '') + 'SQLite/';
    await FileSystem.makeDirectoryAsync(sqliteDirUri, { intermediates: true }).catch(() => {});
    const seedDbName = 'manna_seed_tmp.db';
    const seedDbUri = sqliteDirUri + seedDbName;

    // 씨드를 expo-sqlite 저장 디렉토리에 복사 (같은 디렉토리에 있어야 파일명으로 열 수 있음)
    await FileSystem.copyAsync({ from: seedPath, to: seedDbUri });
    // 임시 파일 (seedPath = Documents/manna_seed.db) 삭제
    await FileSystem.deleteAsync(seedPath, { idempotent: true }).catch(() => {});

    let seedOk = false;
    try {
      // 씨드 DB를 파일명으로 열기 (expo-sqlite는 자신의 디렉토리에서 파일명으로만 열 수 있음)
      const seedDb = await SQLite.openDatabaseAsync(seedDbName);
      let verses: Array<{ id: number; book_id: number; chapter: number; verse: number; text: string }>;
      try {
        verses = await seedDb.getAllAsync<{ id: number; book_id: number; chapter: number; verse: number; text: string }>(
          'SELECT id, book_id, chapter, verse, text FROM bible'
        );
      } finally {
        await seedDb.closeAsync().catch(() => {});
      }
      if (!verses || verses.length === 0) throw new Error('seed bible table is empty');

      await db.execAsync(`
        DROP TABLE IF EXISTS bible;
        CREATE TABLE bible (
          id      INTEGER PRIMARY KEY,
          book_id INTEGER NOT NULL,
          chapter INTEGER NOT NULL,
          verse   INTEGER NOT NULL,
          text    TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_bible_book_chapter ON bible (book_id, chapter);
      `);

      // 500행씩 배치 INSERT (31,102행 → 약 63회)
      const BATCH = 500;
      for (let i = 0; i < verses.length; i += BATCH) {
        const batch = verses.slice(i, i + BATCH);
        const ph = batch.map(() => '(?,?,?,?,?)').join(',');
        const vals = batch.flatMap(v => [v.id, v.book_id, v.chapter, v.verse, v.text]);
        await db.runAsync(`INSERT INTO bible VALUES ${ph}`, vals);
      }

      seedOk = true;
    } catch (err) {
      await db.execAsync('DROP TABLE IF EXISTS bible').catch(() => {});
      throw err;
    } finally {
      await FileSystem.deleteAsync(seedDbUri, { idempotent: true }).catch(() => {});
      if (!seedOk) _dbPromise = null;
    }
  }

  await migrate(db);

  // migrate() 완료 후에만 _db 할당 → 이후 getDb() 빠른 경로에서 안전하게 반환
  _db = db;
  return db;
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
        note         TEXT    NOT NULL CHECK (length(note) <= 2000),
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

  // v2 → v3: verse-level reading tracking + verse range on meditations
  if (user_version < 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS verse_readings (
        book_id  INTEGER NOT NULL,
        chapter  INTEGER NOT NULL,
        verse    INTEGER NOT NULL,
        read_at  TEXT    NOT NULL,
        PRIMARY KEY (book_id, chapter, verse)
      );
      CREATE INDEX IF NOT EXISTS idx_verse_readings ON verse_readings (book_id, chapter);
    `);
    try { await db.execAsync('ALTER TABLE meditations ADD COLUMN verse_start INTEGER'); } catch {}
    try { await db.execAsync('ALTER TABLE meditations ADD COLUMN verse_end INTEGER'); } catch {}
    await db.execAsync('PRAGMA user_version = 3');
  }

  // v3 → v4: FTS5 full-text search on bible content
  if (user_version < 4) {
    await db.execAsync(`
      CREATE VIRTUAL TABLE IF NOT EXISTS bible_fts USING fts5(
        book_id UNINDEXED,
        chapter UNINDEXED,
        verse   UNINDEXED,
        text,
        content='bible',
        content_rowid='id'
      );
    `);
    // Populate from bible table (one-time cost, ~31k rows)
    await db.execAsync(`INSERT INTO bible_fts(bible_fts) VALUES('rebuild');`);
    await db.execAsync('PRAGMA user_version = 4');
  }

  // v4 → v5: AI meditation prompt cache
  if (user_version < 5) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS ai_meditation_cache (
        cache_key  TEXT PRIMARY KEY,
        prompts    TEXT NOT NULL,   -- JSON array of strings
        created_at TEXT NOT NULL
      );
      PRAGMA user_version = 5;
    `);
  }

  // v5 → v6: 캐시 범용 확장(explain/prayer 지원) + 일일 AI 새로고침 카운터
  if (user_version < 6) {
    await db.execAsync(`
      DROP TABLE IF EXISTS ai_meditation_cache;
      CREATE TABLE IF NOT EXISTS ai_cache (
        cache_key  TEXT PRIMARY KEY,  -- "{type}:{bookId}:{chapter}:{verseStart}-{verseEnd}"
        data       TEXT NOT NULL,     -- JSON: any AI response
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_daily_refresh (
        date  TEXT PRIMARY KEY,       -- YYYY-MM-DD
        count INTEGER NOT NULL DEFAULT 0
      );
      PRAGMA user_version = 6;
    `);
  }

  // v6 → v7: meditations note 길이 제한 200 → 2000
  if (user_version < 7) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS meditations_new (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id      INTEGER NOT NULL,
        chapter      INTEGER NOT NULL,
        note         TEXT    NOT NULL CHECK (length(note) <= 2000),
        created_at   TEXT    NOT NULL,
        verse_start  INTEGER,
        verse_end    INTEGER
      );
      INSERT INTO meditations_new SELECT id, book_id, chapter, note, created_at, verse_start, verse_end FROM meditations;
      DROP TABLE meditations;
      ALTER TABLE meditations_new RENAME TO meditations;
      PRAGMA user_version = 7;
    `);
  }

  // v7 → v8: last_opened_position KV (이어읽기)
  if (user_version < 8) {
    await db.execAsync(`
      INSERT OR IGNORE INTO app_settings (key, value) VALUES ('last_opened_position', '');
      PRAGMA user_version = 8;
    `);
  }

  // v8 → v9: 구절 오타 수정 시스템 + 기존 corrections 일괄 적용
  if (user_version < 9) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS applied_corrections (
        book_id  INTEGER NOT NULL,
        chapter  INTEGER NOT NULL,
        verse    INTEGER NOT NULL,
        date     TEXT    NOT NULL,
        PRIMARY KEY (book_id, chapter, verse, date)
      );
      PRAGMA user_version = 9;
    `);
  }

  // v9 → v10: 책갈피
  if (user_version < 10) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        book_id   INTEGER NOT NULL,
        chapter   INTEGER NOT NULL,
        verse     INTEGER NOT NULL,
        saved_at  TEXT    NOT NULL,
        PRIMARY KEY (book_id, chapter, verse)
      );
      CREATE INDEX IF NOT EXISTS idx_bookmarks_chapter ON bookmarks (book_id, chapter);
      PRAGMA user_version = 10;
    `);
  }

  // v10 → v11: 기도제목 그룹
  if (user_version < 11) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS prayer_groups (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        order_idx  INTEGER NOT NULL DEFAULT 0,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      PRAGMA user_version = 11;
    `);
    try { await db.execAsync('ALTER TABLE meditations ADD COLUMN prayer_group_id INTEGER'); } catch {}
  }

  // v11 → v12: 말씀 알림 설정 (읽기 알람과 분리)
  if (user_version < 12) {
    await db.execAsync(`
      INSERT OR IGNORE INTO app_settings (key, value) VALUES ('verse_notif_enabled', '0');
      INSERT OR IGNORE INTO app_settings (key, value) VALUES ('verse_notif_times', '["21:00"]');
      PRAGMA user_version = 12;
    `);
  }

  // v12 → v13: 말씀 알림 콘텐츠 타입 ('verse' | 'question' | 'both')
  if (user_version < 13) {
    await db.execAsync(`
      INSERT OR IGNORE INTO app_settings (key, value) VALUES ('verse_notif_content', 'verse');
      PRAGMA user_version = 13;
    `);
  }

  // v13 → v14: streak freeze + comeback 추적 + comeback 모달 중복 방지
  if (user_version < 14) {
    await db.execAsync(`ALTER TABLE user_stats ADD COLUMN freezes_remaining INTEGER DEFAULT 2`);
    await db.execAsync(`ALTER TABLE user_stats ADD COLUMN freezes_month TEXT`);
    await db.execAsync(`ALTER TABLE user_stats ADD COLUMN comeback_count INTEGER DEFAULT 0`);
    await db.execAsync(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('comeback_shown_date', '')`);
    await db.execAsync(`PRAGMA user_version = 14`);
  }

  // corrections.json에서 미적용 건 반영 (매 실행마다)
  await applyCorrections(db);
}

async function applyCorrections(db: SQLite.SQLiteDatabase): Promise<void> {
  let corrections: Array<{
    book_id: number; chapter: number; verse: number;
    old: string; new: string; date: string;
  }>;
  try {
    corrections = require('../assets/corrections.json');
  } catch {
    return;
  }
  if (!corrections.length) return;

  for (const c of corrections) {
    const already = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM applied_corrections WHERE book_id=? AND chapter=? AND verse=? AND date=?',
      [c.book_id, c.chapter, c.verse, c.date]
    );
    if ((already?.count ?? 0) > 0) continue;

    await db.runAsync(
      'UPDATE bible SET text = REPLACE(text, ?, ?) WHERE book_id = ? AND chapter = ? AND verse = ?',
      [c.old, c.new, c.book_id, c.chapter, c.verse]
    );

    // FTS 동기화
    try {
      await db.execAsync(`INSERT INTO bible_fts(bible_fts) VALUES('rebuild')`);
    } catch {}

    await db.runAsync(
      'INSERT OR IGNORE INTO applied_corrections (book_id, chapter, verse, date) VALUES (?, ?, ?, ?)',
      [c.book_id, c.chapter, c.verse, c.date]
    );
  }
}

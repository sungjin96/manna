// Mock expo-file-system, expo-sharing, expo-document-picker
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file://cache/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { importFromJSON, confirmImport, BackupData } from '../../utils/backup';

// ── DB mock ──────────────────────────────────────────────────────────────────

const _store: Record<string, unknown[]> = {};
let _schemaVersion = 13;

const mockDb = {
  getFirstAsync: jest.fn(async (sql: string) => {
    if (/PRAGMA user_version/.test(sql)) return { user_version: _schemaVersion };
    return null;
  }),
  getAllAsync: jest.fn(async (sql: string) => {
    if (/FROM readings/.test(sql))      return _store['readings']      ?? [];
    if (/FROM meditations/.test(sql))   return _store['meditations']   ?? [];
    if (/FROM verse_readings/.test(sql)) return _store['verse_readings'] ?? [];
    if (/FROM ai_cache/.test(sql))      return _store['ai_cache']      ?? [];
    if (/FROM bookmarks/.test(sql))     return _store['bookmarks']     ?? [];
    if (/FROM prayer_groups/.test(sql)) return _store['prayer_groups'] ?? [];
    if (/FROM app_settings/.test(sql))  return _store['app_settings']  ?? [];
    return [];
  }),
  runAsync: jest.fn(async (sql: string, params?: unknown[]) => {
    const table = (sql.match(/(?:INTO|FROM|DELETE FROM)\s+(\w+)/i) ?? [])[1];
    if (!table) return;
    if (/DELETE FROM/.test(sql)) { _store[table] = []; return; }
    if (/INSERT/.test(sql) && params) _store[table] = [...(_store[table] ?? []), params];
  }),
  withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => { await fn(); }),
};

jest.mock('../../db/schema', () => ({
  getDb: jest.fn(async () => mockDb),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBackup(override: Partial<BackupData> = {}): BackupData {
  return {
    version: 1,
    schemaVersion: 13,
    exportedAt: '2026-04-22T00:00:00.000Z',
    readings: [],
    meditations: [],
    userStats: null,
    appSettings: [],
    verseReadings: [],
    aiCache: [],
    bookmarks: [],
    prayerGroups: [],
    ...override,
  };
}

function mockPickFile(data: object) {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: 'file://test/backup.json' }],
  });
  (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(data));
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(_store).forEach(k => delete _store[k]);
  _schemaVersion = 13;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('importFromJSON', () => {
  test('정상 복원 — 같은 버전', async () => {
    const backup = makeBackup({
      readings: [{ bookId: 1, chapter: 1, completedAt: '2026-04-01' }],
      meditations: [{ bookId: 1, chapter: 1, note: '테스트', createdAt: '2026-04-01T00:00:00Z' }],
    });
    mockPickFile(backup);

    const result = await importFromJSON();

    expect(result.error).toBeNull();
    expect(result.data?.counts).toContain('읽기 1개');
    expect(result.data?.counts).toContain('묵상 1개');
  });

  test('미래 버전 백업 — schema_mismatch 반환', async () => {
    mockPickFile(makeBackup({ schemaVersion: 99 }));

    const result = await importFromJSON();

    expect(result.error).toBe('schema_mismatch');
  });

  test('잘못된 JSON — read_failed 반환', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://test/backup.json' }],
    });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce('{ not valid json <<<');

    const result = await importFromJSON();

    expect(result.error).toBe('read_failed');
  });

  test('구버전 백업 (bookmarks/prayerGroups 없음) — version_downgrade + missingTables 반환', async () => {
    const oldBackup = makeBackup({ schemaVersion: 8 });
    delete (oldBackup as Partial<BackupData>).bookmarks;
    delete (oldBackup as Partial<BackupData>).prayerGroups;
    mockPickFile(oldBackup);

    const result = await importFromJSON();

    expect(result.error).toBe('version_downgrade');
    expect(result.versionMeta?.backupSchemaVersion).toBe(8);
    expect(result.versionMeta?.currentSchemaVersion).toBe(13);
    expect(result.versionMeta?.missingTables).toContain('책갈피');
    expect(result.versionMeta?.missingTables).toContain('기도제목 그룹');
    expect(result.pendingBackup).toBeDefined();
  });

  test('bookmarks 복원', async () => {
    const backup = makeBackup({
      bookmarks: [{ bookId: 43, chapter: 3, verse: 16, savedAt: '2026-04-22T00:00:00Z' }],
    });
    mockPickFile(backup);

    const result = await importFromJSON();

    expect(result.error).toBeNull();
    const insertCalls = (mockDb.runAsync as jest.Mock).mock.calls.filter(
      ([sql]: [string]) => /INSERT.*bookmarks/i.test(sql)
    );
    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0][1]).toEqual([43, 3, 16, '2026-04-22T00:00:00Z']);
  });

  test('prayer_groups 복원 — confirmImport 경로', async () => {
    const backup = makeBackup({
      prayerGroups: [{ id: 1, name: '가족', orderIdx: 0, createdAt: '2026-04-01T00:00:00Z' }],
      meditations: [{ bookId: 1, chapter: 1, note: '기도', createdAt: '2026-04-01T00:00:00Z', prayerGroupId: 1 }],
    });

    const result = await confirmImport(backup);

    expect(result.error).toBeNull();
    const groupInserts = (mockDb.runAsync as jest.Mock).mock.calls.filter(
      ([sql]: [string]) => /INSERT.*prayer_groups/i.test(sql)
    );
    expect(groupInserts.length).toBe(1);
    expect(groupInserts[0][1][1]).toBe('가족');
  });
});

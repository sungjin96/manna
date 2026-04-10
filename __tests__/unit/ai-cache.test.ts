/**
 * Unit tests for db/ai_cache.ts
 * - TTL 7일 hit/miss
 * - 키 없음
 * - JSON 파싱 실패
 * - verse range 캐시 키 구분
 */

import { getAICache, setAICache } from '../../db/ai_cache';

// ── In-memory mock DB ────────────────────────────────────────────────────────

type CacheRow = { cache_key: string; prompts: string; created_at: string };

function createMockDb() {
  const rows: CacheRow[] = [];

  return {
    _rows: rows,

    async runAsync(sql: string, params: unknown[] = []) {
      if (sql.includes('INSERT OR REPLACE INTO ai_meditation_cache')) {
        const [cache_key, prompts, created_at] = params as [string, string, string];
        const idx = rows.findIndex(r => r.cache_key === cache_key);
        if (idx >= 0) rows[idx] = { cache_key, prompts, created_at };
        else rows.push({ cache_key, prompts, created_at });
      }
      return { changes: 1 };
    },

    async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
      if (sql.includes('SELECT prompts, created_at FROM ai_meditation_cache')) {
        const [key] = params as [string];
        const row = rows.find(r => r.cache_key === key);
        return row as unknown as T;
      }
      return undefined;
    },

    async getAllAsync<T>(_sql: string, _params: unknown[] = []): Promise<T[]> {
      return [];
    },
  };
}

let mockDb: ReturnType<typeof createMockDb>;

jest.mock('../../db/schema', () => ({
  getDb: () => Promise.resolve(mockDb),
}));

beforeEach(() => {
  mockDb = createMockDb();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── getAICache ───────────────────────────────────────────────────────────────

describe('getAICache', () => {
  test('캐시 없음 → null 반환', async () => {
    const result = await getAICache(1, 1);
    expect(result).toBeNull();
  });

  test('7일 이내 캐시 → prompts 배열 반환', async () => {
    await setAICache(1, 1, ['Q1', 'Q2', 'Q3']);
    const result = await getAICache(1, 1);
    expect(result).toEqual(['Q1', 'Q2', 'Q3']);
  });

  test('7일 초과 캐시 → null 반환 (TTL 만료)', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    mockDb._rows.push({ cache_key: '1:1:full', prompts: '["Q1","Q2"]', created_at: eightDaysAgo });
    const result = await getAICache(1, 1);
    expect(result).toBeNull();
  });

  test('JSON 파싱 실패 → null 반환', async () => {
    mockDb._rows.push({ cache_key: '1:1:full', prompts: 'invalid json{', created_at: new Date().toISOString() });
    const result = await getAICache(1, 1);
    expect(result).toBeNull();
  });

  test('verse range 키가 full 키와 구분됨', async () => {
    await setAICache(1, 1, ['verse-range'], 3, 5);
    await setAICache(1, 1, ['full-chapter'], undefined, undefined);

    const rangeResult = await getAICache(1, 1, 3, 5);
    const fullResult = await getAICache(1, 1);

    expect(rangeResult).toEqual(['verse-range']);
    expect(fullResult).toEqual(['full-chapter']);
  });
});

// ── setAICache ───────────────────────────────────────────────────────────────

describe('setAICache', () => {
  test('동일 키 재저장 시 기존 row 교체 (INSERT OR REPLACE)', async () => {
    await setAICache(2, 3, ['old']);
    await setAICache(2, 3, ['new']);
    const result = await getAICache(2, 3);
    expect(result).toEqual(['new']);
    // DB에 row가 하나만 있어야 함
    expect(mockDb._rows.filter(r => r.cache_key === '2:3:full')).toHaveLength(1);
  });
});

// SQLite settings mock
const settingsStore: Record<string, string> = {};

jest.mock('../../db/settings', () => ({
  getSetting: jest.fn(async (key: string, defaultValue: string) =>
    settingsStore[key] ?? defaultValue
  ),
  setSetting: jest.fn(async (key: string, value: string) => {
    settingsStore[key] = value;
  }),
}));

import {
  getSearchHistory,
  addSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
} from '../../utils/search-history';

beforeEach(() => {
  Object.keys(settingsStore).forEach(k => delete settingsStore[k]);
  jest.clearAllMocks();
});

describe('getSearchHistory', () => {
  test('저장된 항목 없으면 빈 배열', async () => {
    expect(await getSearchHistory()).toEqual([]);
  });

  test('저장된 항목 반환', async () => {
    settingsStore['search_history'] = JSON.stringify(['사랑', '믿음']);
    expect(await getSearchHistory()).toEqual(['사랑', '믿음']);
  });
});

describe('addSearchHistory', () => {
  test('새 항목 추가 시 맨 앞에 삽입', async () => {
    await addSearchHistory('사랑');
    await addSearchHistory('믿음');
    const result = await getSearchHistory();
    expect(result[0]).toBe('믿음');
    expect(result[1]).toBe('사랑');
  });

  test('중복 항목은 기존 삭제 후 맨 앞에 추가', async () => {
    await addSearchHistory('사랑');
    await addSearchHistory('믿음');
    await addSearchHistory('사랑');
    const result = await getSearchHistory();
    expect(result[0]).toBe('사랑');
    expect(result).toHaveLength(2);
  });

  test('최대 8개 유지 (9번째 추가 시 가장 오래된 제거)', async () => {
    for (let i = 1; i <= 9; i++) {
      await addSearchHistory(`검색어${i}`);
    }
    const result = await getSearchHistory();
    expect(result).toHaveLength(8);
    expect(result[0]).toBe('검색어9');
    expect(result).not.toContain('검색어1');
  });

  test('빈 문자열/공백은 저장하지 않음', async () => {
    await addSearchHistory('');
    await addSearchHistory('   ');
    expect(await getSearchHistory()).toHaveLength(0);
  });
});

describe('removeSearchHistory', () => {
  test('특정 항목 삭제', async () => {
    await addSearchHistory('사랑');
    await addSearchHistory('믿음');
    const result = await removeSearchHistory('사랑');
    expect(result).not.toContain('사랑');
    expect(result).toContain('믿음');
  });

  test('없는 항목 삭제해도 오류 없음', async () => {
    await addSearchHistory('사랑');
    expect(await removeSearchHistory('없는항목')).toEqual(['사랑']);
  });
});

describe('clearSearchHistory', () => {
  test('전체 삭제 후 빈 배열', async () => {
    await addSearchHistory('사랑');
    await addSearchHistory('믿음');
    await clearSearchHistory();
    expect(await getSearchHistory()).toEqual([]);
  });
});

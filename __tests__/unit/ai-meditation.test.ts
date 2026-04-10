import { generateMeditationPrompts, aiErrorMessage } from '../../utils/ai-meditation';

const MOCK_VERSES = [
  { verse: 1, text: '태초에 하나님이 천지를 창조하시니라' },
  { verse: 2, text: '땅이 혼돈하고 공허하며 흑암이 깊음 위에 있고' },
];
const MOCK_VERSE_REF = '창세기 1:1-2';
const MOCK_USER_ID = 'test-user-123';

// ── fetch 모킹 헬퍼 ──────────────────────────────────────────────────────────

function mockFetch(response: Response) {
  global.fetch = jest.fn().mockResolvedValue(response);
}

function mockFetchReject(error: Error) {
  global.fetch = jest.fn().mockRejectedValue(error);
}

function makeResponse(body: object, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ── DEV 모드 ─────────────────────────────────────────────────────────────────

describe('generateMeditationPrompts — DEV 모드', () => {
  test('__DEV__ = true 이면 mock 데이터 반환', async () => {
    // __DEV__ is true in Jest; no fetch spy needed
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_USER_ID);
    expect(result.error).toBeNull();
    expect(result.data?.prompts).toHaveLength(3);
    expect(result.data?.verseRef).toBe(MOCK_VERSE_REF);
  });
});

// ── 성공 경로 (PROD 시뮬레이션) ──────────────────────────────────────────────
// Note: In prod, Worker returns { prompts: string[] } directly

describe('generateMeditationPrompts — Worker 응답 파싱', () => {
  // Override __DEV__ for prod-path tests
  const originalDev = (global as any).__DEV__;
  beforeEach(() => { (global as any).__DEV__ = false; });
  afterEach(() => { (global as any).__DEV__ = originalDev; });

  test('정상 응답: prompts 3개 반환', async () => {
    mockFetch(makeResponse({ prompts: ['질문1', '질문2', '질문3'] }));
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_USER_ID);
    expect(result.error).toBeNull();
    expect(result.data?.prompts).toHaveLength(3);
    expect(result.data?.verseRef).toBe(MOCK_VERSE_REF);
  });

  test('prompts 4개 이상이면 3개만 잘라냄', async () => {
    mockFetch(makeResponse({ prompts: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'] }));
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_USER_ID);
    expect(result.data?.prompts).toHaveLength(3);
  });

  test('403 응답 → no_subscription', async () => {
    mockFetch(makeResponse({}, false, 403));
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_USER_ID);
    expect(result).toEqual({ data: null, error: 'no_subscription' });
  });

  test('5xx 응답 → api_error', async () => {
    mockFetch(makeResponse({}, false, 502));
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_USER_ID);
    expect(result).toEqual({ data: null, error: 'api_error' });
  });

  test('prompts 배열 아닌 응답 → parse_error', async () => {
    mockFetch(makeResponse({ prompts: '문자열' }));
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_USER_ID);
    expect(result).toEqual({ data: null, error: 'parse_error' });
  });

  test('빈 appUserId → no_subscription', async () => {
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, '');
    expect(result).toEqual({ data: null, error: 'no_subscription' });
  });
});

// ── 네트워크/타임아웃 ────────────────────────────────────────────────────────

describe('generateMeditationPrompts — 네트워크 에러', () => {
  const originalDev = (global as any).__DEV__;
  beforeEach(() => { (global as any).__DEV__ = false; });
  afterEach(() => { (global as any).__DEV__ = originalDev; });

  test('fetch 거절 (오프라인) → network_error', async () => {
    mockFetchReject(new Error('Network request failed'));
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_USER_ID);
    expect(result).toEqual({ data: null, error: 'network_error' });
  });

  test('AbortError (타임아웃) → network_error', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetchReject(abortError);
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_USER_ID);
    expect(result).toEqual({ data: null, error: 'network_error' });
  });
});

// ── aiErrorMessage ───────────────────────────────────────────────────────────

describe('aiErrorMessage', () => {
  test('no_subscription 메시지 포함 "프리미엄"', () => {
    expect(aiErrorMessage('no_subscription')).toContain('프리미엄');
  });

  test('network_error 메시지 포함 "오프라인"', () => {
    expect(aiErrorMessage('network_error')).toContain('오프라인');
  });

  test('api_error 메시지 포함 "서버"', () => {
    expect(aiErrorMessage('api_error')).toContain('서버');
  });

  test('parse_error 메시지 포함 "오류"', () => {
    expect(aiErrorMessage('parse_error')).toContain('오류');
  });
});

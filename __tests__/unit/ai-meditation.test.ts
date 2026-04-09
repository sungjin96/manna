import { generateMeditationPrompts, aiErrorMessage } from '../../utils/ai-meditation';

const MOCK_VERSES = [
  { verse: 1, text: '태초에 하나님이 천지를 창조하시니라' },
  { verse: 2, text: '땅이 혼돈하고 공허하며 흑암이 깊음 위에 있고' },
];
const MOCK_VERSE_REF = '창세기 1:1-2';
const MOCK_API_KEY = 'sk-ant-test-key';

// ── apiKey 검증 ──────────────────────────────────────────────────────────────

describe('generateMeditationPrompts — apiKey 검증', () => {
  test('빈 apiKey → no_api_key 에러', async () => {
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, '');
    expect(result).toEqual({ data: null, error: 'no_api_key' });
  });

  test('공백만 있는 apiKey → no_api_key 에러', async () => {
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, '   ');
    expect(result).toEqual({ data: null, error: 'no_api_key' });
  });
});

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

// ── 성공 경로 ────────────────────────────────────────────────────────────────

describe('generateMeditationPrompts — 성공', () => {
  test('정상 응답: prompts 3개 반환', async () => {
    mockFetch(makeResponse({
      content: [{ text: '{"prompts":["질문1","질문2","질문3"]}' }],
    }));

    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_API_KEY);
    expect(result.error).toBeNull();
    expect(result.data?.prompts).toHaveLength(3);
    expect(result.data?.verseRef).toBe(MOCK_VERSE_REF);
  });

  test('마크다운 코드펜스 포함 응답도 파싱 성공', async () => {
    mockFetch(makeResponse({
      content: [{ text: '```json\n{"prompts":["Q1","Q2","Q3"]}\n```' }],
    }));

    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_API_KEY);
    expect(result.error).toBeNull();
    expect(result.data?.prompts).toHaveLength(3);
  });

  test('prompts 4개 이상이면 3개만 잘라냄', async () => {
    mockFetch(makeResponse({
      content: [{ text: '{"prompts":["Q1","Q2","Q3","Q4","Q5"]}' }],
    }));

    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_API_KEY);
    expect(result.data?.prompts).toHaveLength(3);
  });
});

// ── API 에러 경로 ─────────────────────────────────────────────────────────────

describe('generateMeditationPrompts — API 에러', () => {
  test('response.ok === false → api_error', async () => {
    mockFetch(makeResponse({}, false, 401));
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_API_KEY);
    expect(result).toEqual({ data: null, error: 'api_error' });
  });

  test('content 없는 응답 → parse_error', async () => {
    mockFetch(makeResponse({ content: [] }));
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_API_KEY);
    expect(result).toEqual({ data: null, error: 'parse_error' });
  });

  test('JSON 없는 text → parse_error', async () => {
    mockFetch(makeResponse({ content: [{ text: '죄송합니다, 오류가 발생했습니다.' }] }));
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_API_KEY);
    expect(result).toEqual({ data: null, error: 'parse_error' });
  });

  test('prompts 배열 아닌 응답 → parse_error', async () => {
    mockFetch(makeResponse({ content: [{ text: '{"prompts":"문자열"}' }] }));
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_API_KEY);
    expect(result).toEqual({ data: null, error: 'parse_error' });
  });
});

// ── 네트워크/타임아웃 ────────────────────────────────────────────────────────

describe('generateMeditationPrompts — 네트워크 에러', () => {
  test('fetch 거절 (오프라인) → network_error', async () => {
    mockFetchReject(new Error('Network request failed'));
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_API_KEY);
    expect(result).toEqual({ data: null, error: 'network_error' });
  });

  test('AbortError (타임아웃) → network_error', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetchReject(abortError);
    const result = await generateMeditationPrompts(MOCK_VERSES, MOCK_VERSE_REF, MOCK_API_KEY);
    expect(result).toEqual({ data: null, error: 'network_error' });
  });
});

// ── aiErrorMessage ───────────────────────────────────────────────────────────

describe('aiErrorMessage', () => {
  test('no_api_key 메시지 포함 "API key"', () => {
    expect(aiErrorMessage('no_api_key')).toContain('API key');
  });

  test('network_error 메시지 포함 "오프라인"', () => {
    expect(aiErrorMessage('network_error')).toContain('오프라인');
  });

  test('api_error 메시지 포함 "API"', () => {
    expect(aiErrorMessage('api_error')).toContain('API');
  });

  test('parse_error 메시지 포함 "오류"', () => {
    expect(aiErrorMessage('parse_error')).toContain('오류');
  });
});

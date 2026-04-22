import versePools from '../assets/verse-pools.json';

export interface MeditationPrompts {
  prompts: string[];
  verseRef: string;
}

export type AIMeditationError =
  | 'no_subscription'
  | 'free_limit_reached'
  | 'network_error'
  | 'api_error'
  | 'parse_error';

export interface AIMeditationResult {
  data: MeditationPrompts | null;
  error: AIMeditationError | null;
}

export interface ExplanationResult {
  background: string;
  originalWord: string;
  theology: string;
}

export interface AIExplainResult {
  data: ExplanationResult | null;
  error: AIMeditationError | null;
}

export interface AIPrayerResult {
  data: string | null;
  error: AIMeditationError | null;
}

export interface RecommendVerse {
  ref: string;
  text: string;
  reason: string;
}

export interface AIRecommendResult {
  data: RecommendVerse[] | null;
  error: AIMeditationError | null;
}

// Set after `wrangler deploy` — update EXPO_PUBLIC_WORKER_URL in .env.local
const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL ?? '';

const DEV_REAL_AI = process.env.EXPO_PUBLIC_DEV_REAL_AI === 'true';
const DEV_GM_USER_ID = process.env.EXPO_PUBLIC_DEV_GM_USER_ID ?? '';

function resolveUserId(appUserId: string): string {
  if (__DEV__ && DEV_REAL_AI && DEV_GM_USER_ID) return DEV_GM_USER_ID;
  return appUserId;
}

function shouldUseMock(): boolean {
  if (!__DEV__) return false;
  if (DEV_REAL_AI && DEV_GM_USER_ID) return false;
  return true;
}

// ── SSE 스트리밍 헬퍼 ─────────────────────────────────────────────────────────

type SSEChunkEvent = { c: string } | { done: true } | { error: true };

function parseSSEText(
  rawText: string,
  onChunk?: (accumulated: string) => void,
): { text: string; error: boolean } {
  let accumulated = '';
  let hadError = false;

  const parts = rawText.split('\n\n');
  for (const part of parts) {
    const line = part.trim();
    if (!line.startsWith('data: ')) continue;
    const dataStr = line.slice(6);
    let parsed: SSEChunkEvent;
    try {
      parsed = JSON.parse(dataStr);
    } catch {
      continue;
    }
    if ('error' in parsed) { hadError = true; break; }
    if ('done' in parsed) break;
    if ('c' in parsed) {
      accumulated += parsed.c;
      onChunk?.(accumulated);
    }
  }

  return { text: accumulated, error: hadError };
}

/**
 * Worker SSE 스트림을 읽어 토큰을 누적하고 콜백으로 전달합니다.
 * React Native에서 response.body 스트리밍이 지원되지 않으면 response.text() 폴백.
 */
async function readSSEStream(
  response: Response,
  onChunk?: (accumulated: string) => void,
): Promise<{ text: string; error: boolean }> {
  // response.body 스트리밍 지원 여부 확인
  const canStream =
    response.body != null &&
    typeof (response.body as any).getReader === 'function';

  if (!canStream) {
    // 폴백: 전체 텍스트를 받아서 SSE 파싱
    const rawText = await response.text().catch(() => '');
    if (!rawText) return { text: '', error: true };
    return parseSSEText(rawText, onChunk);
  }

  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let hadError = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE는 빈 줄(\n\n)로 이벤트 구분
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data: ')) continue;

        const dataStr = line.slice(6);
        let parsed: SSEChunkEvent;
        try {
          parsed = JSON.parse(dataStr);
        } catch {
          continue;
        }

        if ('error' in parsed) { hadError = true; break; }
        if ('done' in parsed) break;
        if ('c' in parsed) {
          accumulated += parsed.c;
          onChunk?.(accumulated);
        }
      }

      if (hadError) break;
    }
  } finally {
    reader.releaseLock();
  }

  return { text: accumulated, error: hadError };
}

// ── 공통 스트리밍 fetch (XHR 기반 — RN에서 response.body 미지원) ───────────

type StreamFetchResult = {
  text: string | null;
  error: AIMeditationError | null;
};

async function streamFetch(
  endpoint: string,
  body: object,
  userId: string,
  onChunk?: (accumulated: string) => void,
  timeoutMs = 30_000,
): Promise<StreamFetchResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-RC-App-User-Id', userId);
    xhr.timeout = timeoutMs;

    let lastLength = 0;
    let accumulated = '';
    let hadError = false;

    function processNewChunk(text: string) {
      const newText = text.slice(lastLength);
      lastLength = text.length;
      if (!newText) return;

      const parts = newText.split('\n\n');
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6);
        let parsed: SSEChunkEvent;
        try { parsed = JSON.parse(dataStr); } catch { continue; }

        if ('error' in parsed) { hadError = true; return; }
        if ('done' in parsed) return;
        if ('c' in parsed) {
          accumulated += parsed.c;
          onChunk?.(accumulated);
        }
      }
    }

    xhr.onprogress = () => {
      if (!hadError) processNewChunk(xhr.responseText);
    };

    xhr.onload = () => {
      if (xhr.status === 403) {
        let err: AIMeditationError = 'no_subscription';
        try {
          const b = JSON.parse(xhr.responseText) as { error?: string };
          if (b.error === 'free_limit_reached') err = 'free_limit_reached';
        } catch {}
        return resolve({ text: null, error: err });
      }
      if (xhr.status !== 200) {
        return resolve({ text: null, error: 'api_error' });
      }

      // onprogress가 마지막 청크를 놓쳤을 경우 처리
      processNewChunk(xhr.responseText);

      if (hadError) return resolve({ text: null, error: 'api_error' });
      if (!accumulated.trim()) return resolve({ text: null, error: 'parse_error' });
      resolve({ text: accumulated, error: null });
    };

    xhr.onerror = () => resolve({ text: null, error: 'network_error' });
    xhr.ontimeout = () => resolve({ text: null, error: 'network_error' });

    xhr.send(JSON.stringify(body));
  });
}

// ── 텍스트 프로토콜 파서 ──────────────────────────────────────────────────────

/**
 * meditate: 줄바꿈 구분 질문 3개 파싱.
 * 스트리밍 중 누적 텍스트에서 완성된 질문을 즉시 추출.
 */
export function parseMeditateText(text: string): string[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && l.endsWith('?'))
    .slice(0, 3);
}

/**
 * explain: [BG]...[OW]...[TH]... 마커 구분 파싱.
 * 스트리밍 중 완성된 섹션부터 순차 노출 가능.
 */
export function parseExplainText(text: string): Partial<ExplanationResult> {
  const bgMatch = text.match(/\[BG\]([\s\S]*?)(?=\[OW\]|$)/);
  const owMatch = text.match(/\[OW\]([\s\S]*?)(?=\[TH\]|$)/);
  const thMatch = text.match(/\[TH\]([\s\S]*?)$/);

  return {
    background: bgMatch?.[1]?.trim() || undefined,
    originalWord: owMatch?.[1]?.trim() || undefined,
    theology: thMatch?.[1]?.trim() || undefined,
  };
}

/**
 * recommend: ref|text|reason 파이프 구분, 줄바꿈으로 구절 구분 파싱.
 * 스트리밍 중 완성된 줄부터 순차 노출 가능.
 */
export function parseRecommendText(text: string): RecommendVerse[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.includes('|'))
    .map(l => {
      const [ref, verseText, reason] = l.split('|').map(s => s.trim());
      return { ref: ref ?? '', text: verseText ?? '', reason: reason ?? '' };
    })
    .filter(v => v.ref && v.text)
    .slice(0, 3);
}

// ── AI 묵상 질문 ─────────────────────────────────────────────────────────────

export async function generateMeditationPrompts(
  verses: Array<{ verse: number; text: string }>,
  verseRef: string,
  appUserId: string,
  onChunk?: (partial: string[]) => void,
): Promise<AIMeditationResult> {
  if (shouldUseMock()) {
    await new Promise<void>(r => setTimeout(r, 600));
    return {
      data: {
        prompts: [
          '이 구절에서 하나님께서 오늘 나에게 주시는 핵심 메시지는 무엇인가요?',
          '이 말씀을 오늘 하루 구체적으로 어떻게 실천할 수 있을까요?',
          '주님, 이 말씀이 제 삶에 뿌리내리게 하시고 오늘 하루 실천하게 도와주세요.',
        ],
        verseRef,
      },
      error: null,
    };
  }

  const resolvedUserId = resolveUserId(appUserId);
  if (!resolvedUserId) return { data: null, error: 'no_subscription' };

  const verseText = verses.map(v => `${v.verse}절: ${v.text}`).join('\n');

  const { text, error } = await streamFetch(
    `${WORKER_URL}/meditate`,
    { verses: [`${verseRef}\n${verseText}`] },
    resolvedUserId,
    onChunk ? (accumulated) => {
      const partial = parseMeditateText(accumulated);
      if (partial.length > 0) onChunk(partial);
    } : undefined,
  );

  if (error) return { data: null, error };

  const prompts = parseMeditateText(text!);
  if (prompts.length < 1) return { data: null, error: 'parse_error' };

  return { data: { prompts: prompts.slice(0, 3), verseRef }, error: null };
}

// ── AI 구절 해설 ─────────────────────────────────────────────────────────────

export async function generateExplanation(
  verses: Array<{ verse: number; text: string }>,
  verseRef: string,
  appUserId: string,
  onChunk?: (partial: Partial<ExplanationResult>) => void,
): Promise<AIExplainResult> {
  if (shouldUseMock()) {
    await new Promise<void>(r => setTimeout(r, 600));
    return {
      data: {
        background: '이 구절은 초대 교회 시대에 기록된 말씀으로, 당시 성도들이 핍박 속에서도 믿음을 지켰던 역사적 배경을 담고 있습니다.',
        originalWord: '원어에서 핵심 단어는 깊은 사랑과 희생의 의미를 함께 담고 있으며, 단순한 감정이 아닌 의지적 결단을 뜻합니다.',
        theology: '이 구절은 하나님의 주권과 인간을 향한 무조건적 사랑을 동시에 드러냅니다. 구원은 인간의 노력이 아닌 하나님의 은혜로 이루어집니다.',
      },
      error: null,
    };
  }

  const resolvedUserId = resolveUserId(appUserId);
  if (!resolvedUserId) return { data: null, error: 'no_subscription' };

  const verseText = verses.map(v => `${v.verse}절: ${v.text}`).join('\n');

  const { text, error } = await streamFetch(
    `${WORKER_URL}/ai`,
    { action: 'explain', verses: [`${verseRef}\n${verseText}`] },
    resolvedUserId,
    onChunk ? (accumulated) => {
      onChunk(parseExplainText(accumulated));
    } : undefined,
  );

  if (error) return { data: null, error };

  const parsed = parseExplainText(text!);
  if (!parsed.background || !parsed.originalWord || !parsed.theology) {
    return { data: null, error: 'parse_error' };
  }

  return { data: parsed as ExplanationResult, error: null };
}

// ── AI 기도문 생성 ────────────────────────────────────────────────────────────

export async function generatePrayer(
  verses: Array<{ verse: number; text: string }>,
  verseRef: string,
  appUserId: string,
  onChunk?: (partial: string) => void,
): Promise<AIPrayerResult> {
  if (shouldUseMock()) {
    await new Promise<void>(r => setTimeout(r, 600));
    return {
      data: '주님, 오늘 이 말씀을 통해 제 마음에 새로운 빛을 비춰 주셔서 감사합니다. 이 진리가 제 삶 깊이 뿌리내리게 하시고, 오늘 하루 이 말씀대로 살아갈 용기와 지혜를 허락하여 주옵소서. 예수님의 이름으로 기도합니다. 아멘.',
      error: null,
    };
  }

  const resolvedUserId = resolveUserId(appUserId);
  if (!resolvedUserId) return { data: null, error: 'no_subscription' };

  const verseText = verses.map(v => `${v.verse}절: ${v.text}`).join('\n');

  const { text, error } = await streamFetch(
    `${WORKER_URL}/ai`,
    { action: 'prayer', verses: [`${verseRef}\n${verseText}`] },
    resolvedUserId,
    onChunk,
  );

  if (error) return { data: null, error };
  return { data: text!.trim(), error: null };
}

// ── 테마별 구절 추천 ─────────────────────────────────────────────────────────

/**
 * 프리셋 태그용: verse-pools.json에서 무작위 3개 추출. AI 호출 없음.
 */
export function getPoolRecommendation(theme: string): AIRecommendResult {
  const pool = (versePools as Record<string, RecommendVerse[]>)[theme];
  if (!pool || pool.length === 0) return { data: null, error: 'parse_error' };

  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { data: arr.slice(0, 3), error: null };
}

/**
 * 커스텀 입력용: Worker에 AI 요청 (Pro 전용).
 */
export async function generateRecommendation(
  theme: string,
  appUserId: string,
  onChunk?: (partial: RecommendVerse[]) => void,
): Promise<AIRecommendResult> {
  if (shouldUseMock()) {
    await new Promise<void>(r => setTimeout(r, 600));
    return {
      data: [
        { ref: '이사야 41:10', text: '두려워하지 말라 내가 너와 함께 함이라', reason: '두려움과 불안에 하나님의 동행을 약속합니다.' },
        { ref: '빌립보서 4:7', text: '하나님의 평강이 그리스도 예수 안에서 너희 마음과 생각을 지키시리라', reason: '평화를 구하는 마음에 하나님의 평강을 선물합니다.' },
        { ref: '시편 23:1', text: '여호와는 나의 목자시니 내게 부족함이 없으리로다', reason: '일상의 걱정 속에서 하나님의 공급하심을 상기시킵니다.' },
      ],
      error: null,
    };
  }

  const resolvedUserId = resolveUserId(appUserId);
  if (!resolvedUserId) return { data: null, error: 'no_subscription' };
  if (!theme.trim()) return { data: null, error: 'parse_error' };

  const { text, error } = await streamFetch(
    `${WORKER_URL}/ai`,
    { action: 'recommend', theme },
    resolvedUserId,
    onChunk ? (accumulated) => {
      const partial = parseRecommendText(accumulated);
      if (partial.length > 0) onChunk(partial);
    } : undefined,
  );

  if (error) return { data: null, error };

  const verses = parseRecommendText(text!);
  if (verses.length === 0) return { data: null, error: 'parse_error' };

  return { data: verses, error: null };
}

// ── 에러 메시지 ───────────────────────────────────────────────────────────────

export function aiErrorMessage(error: AIMeditationError, dailyLimit?: number): string {
  switch (error) {
    case 'no_subscription':
      return 'AI 기능은 Pro 구독자 전용입니다.';
    case 'free_limit_reached':
      return `오늘 무료 AI 사용 횟수(${dailyLimit ?? 3}회)를 모두 사용했습니다. 내일 다시 사용할 수 있어요.`;
    case 'network_error':
      return '오프라인 상태입니다. 직접 기록해보세요.';
    case 'api_error':
      return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    case 'parse_error':
      return '응답 처리 중 오류가 발생했습니다. 다시 시도해주세요.';
  }
}

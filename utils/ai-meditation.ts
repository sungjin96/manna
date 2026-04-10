export interface MeditationPrompts {
  prompts: string[];
  verseRef: string;
}

export type AIMeditationError =
  | 'no_subscription'
  | 'network_error'
  | 'api_error'
  | 'parse_error';

export interface AIMeditationResult {
  data: MeditationPrompts | null;
  error: AIMeditationError | null;
}

// Set after `wrangler deploy` — update EXPO_PUBLIC_WORKER_URL in .env.local
const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL ?? '';

// GM 개발 모드: EXPO_PUBLIC_DEV_REAL_AI=true 이면 __DEV__ mock 우회
// .env.local 에서 설정: EXPO_PUBLIC_DEV_REAL_AI=true + EXPO_PUBLIC_DEV_GM_USER_ID=<secret>
const DEV_REAL_AI = process.env.EXPO_PUBLIC_DEV_REAL_AI === 'true';
const DEV_GM_USER_ID = process.env.EXPO_PUBLIC_DEV_GM_USER_ID ?? '';

function resolveUserId(appUserId: string): string {
  // GM 모드일 때 Worker에서 인식 가능한 GM userId로 교체
  if (__DEV__ && DEV_REAL_AI && DEV_GM_USER_ID) return DEV_GM_USER_ID;
  return appUserId;
}

function shouldUseMock(): boolean {
  if (!__DEV__) return false;
  if (DEV_REAL_AI && DEV_GM_USER_ID) return false;  // GM 모드: 실제 API 사용
  return true;  // 일반 dev: mock
}

export async function generateMeditationPrompts(
  verses: Array<{ verse: number; text: string }>,
  verseRef: string,
  appUserId: string,
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
  if (!resolvedUserId) {
    return { data: null, error: 'no_subscription' };
  }

  const verseText = verses.map(v => `${v.verse}절: ${v.text}`).join('\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(`${WORKER_URL}/meditate`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-RC-App-User-Id': resolvedUserId,
      },
      body: JSON.stringify({ verses: [`${verseRef}\n${verseText}`] }),
    });
    clearTimeout(timeoutId);

    if (response.status === 403) {
      return { data: null, error: 'no_subscription' };
    }
    if (!response.ok) {
      return { data: null, error: 'api_error' };
    }

    const json = await response.json() as { prompts?: unknown };
    if (!Array.isArray(json?.prompts)) return { data: null, error: 'parse_error' };

    return {
      data: { prompts: (json.prompts as string[]).slice(0, 3), verseRef },
      error: null,
    };
  } catch {
    clearTimeout(timeoutId);
    return { data: null, error: 'network_error' };
  }
}

export function aiErrorMessage(error: AIMeditationError): string {
  switch (error) {
    case 'no_subscription':
      return 'AI 묵상은 프리미엄 구독자 전용입니다.';
    case 'network_error':
      return '오프라인 상태입니다. 직접 기록해보세요.';
    case 'api_error':
      return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    case 'parse_error':
      return '응답 처리 중 오류가 발생했습니다.';
  }
}

// ── AI 구절 해설 ──────────────────────────────────────────────────────────────

export interface ExplanationResult {
  background: string;   // 역사적·문화적 배경
  originalWord: string; // 원어 의미
  theology: string;     // 신학적 핵심
}

export interface AIExplainResult {
  data: ExplanationResult | null;
  error: AIMeditationError | null;
}

export async function generateExplanation(
  verses: Array<{ verse: number; text: string }>,
  verseRef: string,
  appUserId: string,
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 18_000);

  try {
    const response = await fetch(`${WORKER_URL}/ai`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-RC-App-User-Id': resolvedUserId },
      body: JSON.stringify({ action: 'explain', verses: [`${verseRef}\n${verseText}`] }),
    });
    clearTimeout(timeoutId);

    if (response.status === 403) return { data: null, error: 'no_subscription' };
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[explain] Worker ${response.status}:`, body);
      return { data: null, error: 'api_error' };
    }

    const json = await response.json() as Partial<ExplanationResult>;
    if (!json.background || !json.originalWord || !json.theology) {
      return { data: null, error: 'parse_error' };
    }
    return { data: json as ExplanationResult, error: null };
  } catch {
    clearTimeout(timeoutId);
    return { data: null, error: 'network_error' };
  }
}

// ── AI 기도문 생성 ────────────────────────────────────────────────────────────

export interface AIPrayerResult {
  data: string | null;  // 기도문 텍스트
  error: AIMeditationError | null;
}

export async function generatePrayer(
  verses: Array<{ verse: number; text: string }>,
  verseRef: string,
  appUserId: string,
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 18_000);

  try {
    const response = await fetch(`${WORKER_URL}/ai`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-RC-App-User-Id': resolvedUserId },
      body: JSON.stringify({ action: 'prayer', verses: [`${verseRef}\n${verseText}`] }),
    });
    clearTimeout(timeoutId);

    if (response.status === 403) return { data: null, error: 'no_subscription' };
    if (!response.ok) return { data: null, error: 'api_error' };

    const json = await response.json() as { prayer?: string };
    if (!json.prayer) return { data: null, error: 'parse_error' };
    return { data: json.prayer, error: null };
  } catch {
    clearTimeout(timeoutId);
    return { data: null, error: 'network_error' };
  }
}

// ── AI 테마별 구절 추천 ───────────────────────────────────────────────────────

export interface RecommendVerse {
  ref: string;    // 예: "요한복음 3:16"
  text: string;   // 구절 본문
  reason: string; // 추천 이유
}

export interface AIRecommendResult {
  data: RecommendVerse[] | null;
  error: AIMeditationError | null;
}

export async function generateRecommendation(
  theme: string,
  appUserId: string,
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

  if (!appUserId) return { data: null, error: 'no_subscription' };
  if (!theme.trim()) return { data: null, error: 'parse_error' };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 18_000);

  try {
    const response = await fetch(`${WORKER_URL}/ai`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-RC-App-User-Id': appUserId },
      body: JSON.stringify({ action: 'recommend', theme }),
    });
    clearTimeout(timeoutId);

    if (response.status === 403) return { data: null, error: 'no_subscription' };
    if (!response.ok) return { data: null, error: 'api_error' };

    const json = await response.json() as { verses?: unknown[] };
    if (!Array.isArray(json?.verses) || json.verses.length === 0) {
      return { data: null, error: 'parse_error' };
    }
    return { data: json.verses as RecommendVerse[], error: null };
  } catch {
    clearTimeout(timeoutId);
    return { data: null, error: 'network_error' };
  }
}

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

export async function generateMeditationPrompts(
  verses: Array<{ verse: number; text: string }>,
  verseRef: string,
  appUserId: string,
): Promise<AIMeditationResult> {
  if (__DEV__) {
    // Avoid needing RC sandbox subscription during development
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

  if (!appUserId) {
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
        'X-RC-App-User-Id': appUserId,
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

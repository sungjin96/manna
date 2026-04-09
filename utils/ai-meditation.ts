export interface MeditationPrompts {
  prompts: string[];
  verseRef: string;
}

export type AIMeditationError =
  | 'no_api_key'
  | 'network_error'
  | 'api_error'
  | 'parse_error';

export interface AIMeditationResult {
  data: MeditationPrompts | null;
  error: AIMeditationError | null;
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // Fast + cheap for mobile

export async function generateMeditationPrompts(
  verses: Array<{ verse: number; text: string }>,
  verseRef: string,
  apiKey: string,
): Promise<AIMeditationResult> {
  if (!apiKey.trim()) {
    return { data: null, error: 'no_api_key' };
  }

  const verseText = verses.map(v => `${v.verse}절: ${v.text}`).join('\n');
  const systemPrompt = `당신은 성경 묵상을 돕는 조용하고 따뜻한 도우미입니다.
사용자가 읽은 성경 구절을 바탕으로 깊이 있는 묵상 질문 3개를 한국어로 생성해주세요.
질문은 개인의 신앙과 삶에 적용 가능한 것이어야 합니다.
JSON 형식으로만 응답하세요: {"prompts": ["질문1", "질문2", "질문3"]}`;

  const userMessage = `다음 구절을 묵상하는 데 도움이 되는 질문 3개를 생성해주세요:\n\n${verseRef}\n\n${verseText}`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      return { data: null, error: 'api_error' };
    }

    const json = await response.json();
    const content = json?.content?.[0]?.text;
    if (!content) return { data: null, error: 'parse_error' };

    // Extract JSON from response (handle possible markdown code fences)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { data: null, error: 'parse_error' };

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed?.prompts)) return { data: null, error: 'parse_error' };

    return {
      data: { prompts: parsed.prompts.slice(0, 3), verseRef },
      error: null,
    };
  } catch {
    return { data: null, error: 'network_error' };
  }
}

export function aiErrorMessage(error: AIMeditationError): string {
  switch (error) {
    case 'no_api_key':
      return '설정에서 Claude API key를 입력해주세요.';
    case 'network_error':
      return '오프라인 상태입니다. 직접 기록해보세요.';
    case 'api_error':
      return 'API 오류가 발생했습니다. API key를 확인해주세요.';
    case 'parse_error':
      return '응답 처리 중 오류가 발생했습니다.';
  }
}

import { getKSTDateString, getDayOfYear } from './kst-date';

export interface DailyEntry {
  bookId: number;
  chapter: number;
  verse: number;
  text: string;           // 구절 본문
  ref: string;            // 예: "시편 23:1"
  question: string;       // 묵상 질문
}

let _cache: DailyEntry[] | null = null;

function loadEntries(): DailyEntry[] {
  if (_cache) return _cache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _cache = require('../assets/daily-meditations.json') as DailyEntry[];
  } catch {
    _cache = [];
  }
  return _cache ?? [];
}

/**
 * KST 날짜 기준으로 오늘의 DailyEntry 반환.
 * dateStr을 넘기면 해당 날짜로 결정론적 선택.
 */
export function getDailyEntry(dateStr?: string): DailyEntry | null {
  const entries = loadEntries();
  if (entries.length === 0) return null;

  const date = dateStr ?? getKSTDateString();
  const dayOfYear = getDayOfYear(date);
  // dayOfYear는 1-based, 윤년(366일) 경계 처리
  const index = (dayOfYear - 1) % entries.length;
  return entries[index] ?? null;
}

/** 캐시 초기화 (테스트용) */
export function _resetDailyCache(): void {
  _cache = null;
}

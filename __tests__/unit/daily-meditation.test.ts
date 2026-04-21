import { getDailyEntry, _resetDailyCache } from '../../utils/daily-meditation';

// daily-meditations.json 모킹
const MOCK_ENTRIES = [
  { bookId: 19, chapter: 23, verse: 1, text: '여호와는 나의 목자시니', ref: '시편 23:1', question: '질문1' },
  { bookId: 43, chapter: 3, verse: 16, text: '하나님이 세상을 이처럼 사랑하사', ref: '요한복음 3:16', question: '질문2' },
  { bookId: 50, chapter: 4, verse: 13, text: '내게 능력 주시는 자 안에서', ref: '빌립보서 4:13', question: '질문3' },
  { bookId: 20, chapter: 3, verse: 5, text: '너는 마음을 다하여', ref: '잠언 3:5', question: '질문4' },
  { bookId: 23, chapter: 40, verse: 31, text: '오직 여호와를 앙망하는 자는', ref: '이사야 40:31', question: '질문5' },
];

jest.mock('../../assets/daily-meditations.json', () => MOCK_ENTRIES, { virtual: true });

beforeEach(() => {
  _resetDailyCache();
});

describe('getDailyEntry', () => {
  test('날짜 문자열로 결정론적 엔트리 반환', () => {
    const entry = getDailyEntry('2026-01-01');
    expect(entry).not.toBeNull();
    // 1월 1일 = day 1, index 0
    expect(entry?.ref).toBe('시편 23:1');
  });

  test('같은 날짜는 항상 같은 엔트리 반환', () => {
    const e1 = getDailyEntry('2026-04-21');
    const e2 = getDailyEntry('2026-04-21');
    expect(e1?.ref).toBe(e2?.ref);
  });

  test('날짜가 다르면 다른 엔트리 반환 (인덱스 다름)', () => {
    const e1 = getDailyEntry('2026-01-01'); // day 1 → index 0
    const e2 = getDailyEntry('2026-01-02'); // day 2 → index 1
    expect(e1?.ref).not.toBe(e2?.ref);
  });

  test('윤년 366일 경계 처리 (% entries.length)', () => {
    // 2024년 12월 31일 = day 366, 5개 엔트리 → 366 % 5 = 1 → index 0 (0-based: (366-1)%5 = 0)
    const entry = getDailyEntry('2024-12-31');
    expect(entry).not.toBeNull();
  });

  test('5일 순환 — 6번째는 첫 번째와 같음', () => {
    // day 1 → index 0, day 6 → index 5 % 5 = 0
    const e1 = getDailyEntry('2026-01-01'); // day 1 → (1-1)%5 = 0
    const e6 = getDailyEntry('2026-01-06'); // day 6 → (6-1)%5 = 0
    expect(e1?.ref).toBe(e6?.ref);
  });
});

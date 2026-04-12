import { CURATED_CHAPTERS, getTodayRecommendation, getRandomChapter } from '../../constants/discovery';
import { BOOKS } from '../../constants/books';

// ── CURATED_CHAPTERS 유효성 ────────────────────────────────────────────────

describe('CURATED_CHAPTERS', () => {
  test('비어있지 않음', () => {
    expect(CURATED_CHAPTERS.length).toBeGreaterThan(0);
  });

  test('모든 bookId가 BOOKS에 존재함', () => {
    for (const entry of CURATED_CHAPTERS) {
      const book = BOOKS.find(b => b.id === entry.bookId);
      expect(book).toBeDefined();
    }
  });

  test('모든 chapter가 해당 책 범위 내에 있음', () => {
    for (const entry of CURATED_CHAPTERS) {
      const book = BOOKS.find(b => b.id === entry.bookId)!;
      expect(entry.chapter).toBeGreaterThanOrEqual(1);
      expect(entry.chapter).toBeLessThanOrEqual(book.chapters);
    }
  });
});

// ── getTodayRecommendation ─────────────────────────────────────────────────

describe('getTodayRecommendation', () => {
  test('빈 completedSet → CURATED_CHAPTERS 중 하나 반환', () => {
    const result = getTodayRecommendation(new Set());
    expect(result).not.toBeNull();
    const inCurated = CURATED_CHAPTERS.some(
      c => c.bookId === result!.bookId && c.chapter === result!.chapter
    );
    expect(inCurated).toBe(true);
  });

  test('모두 완료한 경우 → fallback으로 CURATED_CHAPTERS 중 하나 반환', () => {
    const allDone = new Set(CURATED_CHAPTERS.map(c => `${c.bookId}:${c.chapter}`));
    const result = getTodayRecommendation(allDone);
    expect(result).not.toBeNull();
    const inCurated = CURATED_CHAPTERS.some(
      c => c.bookId === result!.bookId && c.chapter === result!.chapter
    );
    expect(inCurated).toBe(true);
  });

  test('같은 날 동일 결과 반환 (결정론적)', () => {
    const completed = new Set<string>();
    const a = getTodayRecommendation(completed);
    const b = getTodayRecommendation(completed);
    expect(a).toEqual(b);
  });

  test('일부 완료 시 미읽은 챕터 중에서 선택', () => {
    // 첫 챕터만 완료로 표시
    const first = CURATED_CHAPTERS[0];
    const completed = new Set([`${first.bookId}:${first.chapter}`]);
    // 결과가 완료된 챕터가 아닌지 확인 (운이 없으면 실패할 수 있지만, seed 기반이라 결정론적)
    const result = getTodayRecommendation(completed);
    expect(result).not.toBeNull();
    // 미읽은 챕터가 충분히 있으면 완료된 챕터를 선택하지 않음
    if (CURATED_CHAPTERS.length > 1) {
      const wasCompleted = result!.bookId === first.bookId && result!.chapter === first.chapter;
      // seed % (length-1) 범위이므로 완료 챕터가 선택될 수 없음
      expect(wasCompleted).toBe(false);
    }
  });
});

// ── getRandomChapter ───────────────────────────────────────────────────────

describe('getRandomChapter', () => {
  test('반환값이 유효한 bookId, chapter 범위 내에 있음', () => {
    for (let i = 0; i < 20; i++) {
      const result = getRandomChapter();
      const book = BOOKS.find(b => b.id === result.bookId);
      expect(book).toBeDefined();
      expect(result.chapter).toBeGreaterThanOrEqual(1);
      expect(result.chapter).toBeLessThanOrEqual(book!.chapters);
    }
  });

  test('exclude와 동일하면 재시도 — 20회 중 적어도 한 번은 다른 결과', () => {
    // exclude를 고정하고 20회 호출 시 최소 한 번은 다른 결과
    const exclude = { bookId: 1, chapter: 1 };
    const results = Array.from({ length: 20 }, () => getRandomChapter(exclude));
    const hasDifferent = results.some(
      r => !(r.bookId === exclude.bookId && r.chapter === exclude.chapter)
    );
    expect(hasDifferent).toBe(true);
  });
});

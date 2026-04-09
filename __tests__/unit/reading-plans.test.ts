import { getChaptersForDay, getPlanProgress, getPlanOrder } from '../../constants/reading-plans';

// Fixed reference date for all tests: 2026-04-09 (Wednesday)
const WEDNESDAY = '2026-04-09';
const THURSDAY  = '2026-04-10';
const SATURDAY  = '2026-04-11';
const SUNDAY    = '2026-04-12';

// Mock Date so tests are deterministic regardless of when they run
function withDate(isoDate: string, fn: () => void) {
  const RealDate = global.Date;
  const fixed = new Date(isoDate + 'T00:00:00.000Z');
  // Offset to simulate local midnight
  const fixedLocal = new Date(isoDate);
  fixedLocal.setHours(0, 0, 0, 0);

  class MockDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof RealDate>) {
      if (args.length === 0) {
        super(isoDate);
      } else {
        // @ts-expect-error spread
        super(...args);
      }
    }
    static now() { return new RealDate(isoDate).getTime(); }
  }
  global.Date = MockDate as typeof Date;
  try { fn(); } finally { global.Date = RealDate; }
}

// ── getPlanOrder ─────────────────────────────────────────────────────────────

describe('getPlanOrder', () => {
  test('sequential: 1189개 챕터 반환', () => {
    const order = getPlanOrder('sequential');
    expect(order.length).toBe(1189);
    expect(order[0]).toEqual({ bookId: 1, chapter: 1 });
    expect(order[order.length - 1]).toEqual({ bookId: 66, chapter: 22 });
  });

  test('nt-first: 신약 챕터가 먼저 나옴', () => {
    const order = getPlanOrder('nt-first');
    expect(order.length).toBe(1189);
    // First chapter should be Matthew 1 (bookId 40)
    expect(order[0]).toEqual({ bookId: 40, chapter: 1 });
  });

  test('chronological: 1189개 챕터 반환', () => {
    const order = getPlanOrder('chronological');
    expect(order.length).toBe(1189);
  });

  test('weekday-rhythm: sequential과 동일한 순서', () => {
    const wk = getPlanOrder('weekday-rhythm');
    const seq = getPlanOrder('sequential');
    expect(wk).toEqual(seq);
  });
});

// ── getChaptersForDay — fixed plan (chaptersPerDay = 3) ──────────────────────

describe('getChaptersForDay — sequential (3장/일)', () => {
  test('day 0: 창세기 1-3장', () => {
    withDate(WEDNESDAY, () => {
      const chapters = getChaptersForDay('sequential', WEDNESDAY);
      expect(chapters).toEqual([
        { bookId: 1, chapter: 1 },
        { bookId: 1, chapter: 2 },
        { bookId: 1, chapter: 3 },
      ]);
    });
  });

  test('day 1: 창세기 4-6장', () => {
    withDate(THURSDAY, () => {
      const chapters = getChaptersForDay('sequential', WEDNESDAY);
      expect(chapters).toEqual([
        { bookId: 1, chapter: 4 },
        { bookId: 1, chapter: 5 },
        { bookId: 1, chapter: 6 },
      ]);
    });
  });

  test('미래 시작일: 빈 배열 반환', () => {
    withDate(WEDNESDAY, () => {
      // Plan starts tomorrow
      const chapters = getChaptersForDay('sequential', THURSDAY);
      expect(chapters).toEqual([]);
    });
  });

  test('플랜 완료: 빈 배열 반환', () => {
    withDate(WEDNESDAY, () => {
      // Start ~397 days ago → 397 * 3 = 1191 > 1189 chapters
      const longAgo = new Date(WEDNESDAY);
      longAgo.setFullYear(longAgo.getFullYear() - 2);
      const pastISO = longAgo.toISOString().slice(0, 10);
      const chapters = getChaptersForDay('sequential', pastISO);
      expect(chapters).toEqual([]);
    });
  });
});

// ── getChaptersForDay — variable plan (weekday-rhythm) ──────────────────────

describe('getChaptersForDay — weekday-rhythm', () => {
  test('평일 day 0 (수요일): 3장', () => {
    withDate(WEDNESDAY, () => {
      const chapters = getChaptersForDay('weekday-rhythm', WEDNESDAY);
      expect(chapters).toHaveLength(3);
      expect(chapters[0]).toEqual({ bookId: 1, chapter: 1 });
    });
  });

  test('토요일: 5장', () => {
    withDate(SATURDAY, () => {
      const chapters = getChaptersForDay('weekday-rhythm', SATURDAY);
      expect(chapters).toHaveLength(5);
    });
  });

  test('일요일: 5장', () => {
    withDate(SUNDAY, () => {
      const chapters = getChaptersForDay('weekday-rhythm', SUNDAY);
      expect(chapters).toHaveLength(5);
    });
  });

  test('평일 3일 뒤: 누적 9장 이후부터 3장', () => {
    // Start: Wednesday. Today: Saturday (3 days later = Thu/Fri/Sat)
    // Wed → Thur: 3, Thur → Fri: 3, consumed before today = 6
    // Today (Sat): 5 chapters starting at idx 6
    withDate(SATURDAY, () => {
      const chapters = getChaptersForDay('weekday-rhythm', WEDNESDAY);
      expect(chapters).toHaveLength(5);
      expect(chapters[0]).toEqual({ bookId: 1, chapter: 7 }); // idx 6 = genesis 7
    });
  });

  test('미래 시작일: 빈 배열', () => {
    withDate(WEDNESDAY, () => {
      const chapters = getChaptersForDay('weekday-rhythm', THURSDAY);
      expect(chapters).toEqual([]);
    });
  });
});

// ── getPlanProgress ──────────────────────────────────────────────────────────

describe('getPlanProgress', () => {
  test('day 0: 0', () => {
    withDate(WEDNESDAY, () => {
      expect(getPlanProgress('sequential', WEDNESDAY)).toBe(0);
    });
  });

  test('절반 지점: ~0.5', () => {
    withDate(WEDNESDAY, () => {
      // 1189 chapters / 3 per day = ~396 days. Half = 198 days back
      const halfAgo = new Date(WEDNESDAY);
      halfAgo.setDate(halfAgo.getDate() - 198);
      const halfISO = halfAgo.toISOString().slice(0, 10);
      const progress = getPlanProgress('sequential', halfISO);
      expect(progress).toBeGreaterThan(0.48);
      expect(progress).toBeLessThan(0.52);
    });
  });

  test('플랜 완료 후: 1 (cap)', () => {
    withDate(WEDNESDAY, () => {
      const longAgo = new Date(WEDNESDAY);
      longAgo.setFullYear(longAgo.getFullYear() - 2);
      const pastISO = longAgo.toISOString().slice(0, 10);
      expect(getPlanProgress('sequential', pastISO)).toBe(1);
    });
  });
});

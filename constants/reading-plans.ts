import { BOOKS } from './books';

export type PlanId = 'sequential' | 'nt-first' | 'chronological' | 'weekday-rhythm';

export interface ReadingPlan {
  id: PlanId;
  name: string;
  description: string;
  chaptersPerDay: number;       // fixed daily chapters (0 = variable)
  weekdayChapters?: number;     // used when chaptersPerDay === 0
  weekendChapters?: number;
}

export const READING_PLANS: ReadingPlan[] = [
  {
    id: 'sequential',
    name: '순서 통독',
    description: '창세기부터 요한계시록까지 순서대로 읽기',
    chaptersPerDay: 3,
  },
  {
    id: 'nt-first',
    name: '신약 먼저',
    description: '신약(27권)을 완독 후 구약으로 이어 읽기',
    chaptersPerDay: 3,
  },
  {
    id: 'chronological',
    name: '연대기 통독',
    description: '성경 사건의 시간 순서대로 읽기 (구약→신약)',
    chaptersPerDay: 3,
  },
  {
    id: 'weekday-rhythm',
    name: '평일 3장 / 주말 5장',
    description: '평일 3장, 토·일 5장 — 약 48주 완독',
    chaptersPerDay: 0,
    weekdayChapters: 3,
    weekendChapters: 5,
  },
];

export interface PlanChapter {
  bookId: number;
  chapter: number;
}

// Build sequential chapter order (창세기→요한계시록)
function sequentialOrder(): PlanChapter[] {
  const chapters: PlanChapter[] = [];
  for (const book of BOOKS) {
    for (let ch = 1; ch <= book.chapters; ch++) {
      chapters.push({ bookId: book.id, chapter: ch });
    }
  }
  return chapters;
}

// Build NT-first order (신약 완독 후 구약)
function ntFirstOrder(): PlanChapter[] {
  const nt = BOOKS.filter(b => b.testament === 'new');
  const ot = BOOKS.filter(b => b.testament === 'old');
  const chapters: PlanChapter[] = [];
  for (const book of [...nt, ...ot]) {
    for (let ch = 1; ch <= book.chapters; ch++) {
      chapters.push({ bookId: book.id, chapter: ch });
    }
  }
  return chapters;
}

// Chronological order: approximate historical sequence
// OT: Law → History → Poetry → Prophets (woven), then NT: Gospels → Acts → Epistles → Revelation
const CHRONOLOGICAL_BOOK_ORDER: number[] = [
  // Genesis through Deuteronomy
  1, 2, 3, 4, 5,
  // Historical
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
  // Poetry (woven with history period)
  18, 19, 20, 21, 22,
  // Major prophets
  23, 24, 25, 26, 27,
  // Minor prophets
  28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  // NT: Gospels
  40, 41, 42, 43,
  // Acts
  44,
  // Paul's letters (rough chronological)
  48, 49, 52, 53, 45, 46, 47, 50, 51, 54, 55, 56, 57, 58,
  // General epistles
  59, 60, 61, 62, 63, 64, 65,
  // Revelation
  66,
];

function chronologicalOrder(): PlanChapter[] {
  const chapters: PlanChapter[] = [];
  for (const bookId of CHRONOLOGICAL_BOOK_ORDER) {
    const book = BOOKS.find(b => b.id === bookId);
    if (!book) continue;
    for (let ch = 1; ch <= book.chapters; ch++) {
      chapters.push({ bookId: book.id, chapter: ch });
    }
  }
  return chapters;
}

// Cache computed orders
const _orderCache: Partial<Record<PlanId, PlanChapter[]>> = {};

export function getPlanOrder(planId: PlanId): PlanChapter[] {
  if (!_orderCache[planId]) {
    switch (planId) {
      case 'sequential':     _orderCache[planId] = sequentialOrder(); break;
      case 'nt-first':       _orderCache[planId] = ntFirstOrder(); break;
      case 'chronological':  _orderCache[planId] = chronologicalOrder(); break;
      case 'weekday-rhythm': _orderCache[planId] = sequentialOrder(); break; // same order, variable daily count
    }
  }
  return _orderCache[planId]!;
}

// Cache for getVariableStartIndex — keyed by "planId:startDateISO:todayISO"
const _variableIdxCache: Map<string, { startIdx: number; todayCount: number }> = new Map();

// For variable-chapter plans (weekday-rhythm), compute start index by walking
// day by day from startDate to today and summing chapters consumed each day.
function getVariableStartIndex(plan: ReadingPlan, startDateISO: string): { startIdx: number; todayCount: number } {
  const todayISO = new Date().toISOString().slice(0, 10);
  const cacheKey = `${plan.id}:${startDateISO}:${todayISO}`;
  const cached = _variableIdxCache.get(cacheKey);
  if (cached) return cached;
  const weekday = plan.weekdayChapters ?? 3;
  const weekend = plan.weekendChapters ?? 5;

  const start = new Date(startDateISO);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let consumed = 0;
  const d = new Date(start);
  while (d < today) {
    const dow = d.getDay(); // 0=Sun, 6=Sat
    consumed += (dow === 0 || dow === 6) ? weekend : weekday;
    d.setDate(d.getDate() + 1);
  }

  const todayDow = today.getDay();
  const todayCount = (todayDow === 0 || todayDow === 6) ? weekend : weekday;
  const result = { startIdx: consumed, todayCount };
  _variableIdxCache.set(cacheKey, result);
  return result;
}

// Get chapters assigned to today based on start date
export function getChaptersForDay(planId: PlanId, startDateISO: string): PlanChapter[] {
  const plan = READING_PLANS.find(p => p.id === planId);
  if (!plan) return [];

  const start = new Date(startDateISO);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today < start) return []; // plan hasn't started yet

  const order = getPlanOrder(planId);

  if (plan.chaptersPerDay === 0) {
    // Variable daily count (e.g. weekday-rhythm)
    const { startIdx, todayCount } = getVariableStartIndex(plan, startDateISO);
    if (startIdx >= order.length) return []; // plan complete
    return order.slice(startIdx, Math.min(startIdx + todayCount, order.length));
  }

  const dayIndex = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  const startIdx = dayIndex * plan.chaptersPerDay;
  if (startIdx >= order.length) return []; // plan complete
  return order.slice(startIdx, Math.min(startIdx + plan.chaptersPerDay, order.length));
}

// How far into the plan are we? Returns 0..1
export function getPlanProgress(planId: PlanId, startDateISO: string): number {
  const plan = READING_PLANS.find(p => p.id === planId);
  if (!plan) return 0;
  const order = getPlanOrder(planId);

  if (plan.chaptersPerDay === 0) {
    const { startIdx } = getVariableStartIndex(plan, startDateISO);
    return Math.min(startIdx / order.length, 1);
  }

  const start = new Date(startDateISO);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayIndex = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return Math.min(dayIndex * plan.chaptersPerDay / order.length, 1);
}

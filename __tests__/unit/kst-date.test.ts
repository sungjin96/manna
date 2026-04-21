import { getKSTDateString, getDayOfYear } from '../../utils/kst-date';

describe('getKSTDateString', () => {
  test('UTC 자정은 KST 오전 9시 — 같은 날짜', () => {
    const utcMidnight = new Date('2026-01-15T00:00:00.000Z');
    expect(getKSTDateString(utcMidnight)).toBe('2026-01-15');
  });

  test('UTC 14:59은 KST 23:59 — 같은 날짜', () => {
    const utc1459 = new Date('2026-01-15T14:59:00.000Z');
    expect(getKSTDateString(utc1459)).toBe('2026-01-15');
  });

  test('UTC 15:00은 KST 다음날 자정 — 날짜가 바뀜', () => {
    const utc1500 = new Date('2026-01-15T15:00:00.000Z');
    expect(getKSTDateString(utc1500)).toBe('2026-01-16');
  });

  test('KST 기준 월 경계 (1월 31일 오후 → 2월 1일)', () => {
    const utc = new Date('2026-01-31T15:00:00.000Z'); // KST 2026-02-01 00:00
    expect(getKSTDateString(utc)).toBe('2026-02-01');
  });

  test('KST 기준 연도 경계', () => {
    const utc = new Date('2025-12-31T15:00:00.000Z'); // KST 2026-01-01 00:00
    expect(getKSTDateString(utc)).toBe('2026-01-01');
  });
});

describe('getDayOfYear', () => {
  test('1월 1일 = 1', () => {
    expect(getDayOfYear('2026-01-01')).toBe(1);
  });

  test('12월 31일 (비윤년) = 365', () => {
    expect(getDayOfYear('2026-12-31')).toBe(365);
  });

  test('12월 31일 (윤년) = 366', () => {
    expect(getDayOfYear('2024-12-31')).toBe(366);
  });

  test('2월 28일 (비윤년) = 59', () => {
    expect(getDayOfYear('2026-02-28')).toBe(59);
  });

  test('2월 29일 (윤년) = 60', () => {
    expect(getDayOfYear('2024-02-29')).toBe(60);
  });

  test('3월 1일 (비윤년) = 60', () => {
    expect(getDayOfYear('2026-03-01')).toBe(60);
  });

  test('3월 1일 (윤년) = 61', () => {
    expect(getDayOfYear('2024-03-01')).toBe(61);
  });
});

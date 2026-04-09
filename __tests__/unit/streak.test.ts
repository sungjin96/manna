import { getPreviousDay, computeNewStreak } from '../../utils/streak';

describe('getPreviousDay', () => {
  test('일반 날짜', () => {
    expect(getPreviousDay('2026-04-09')).toBe('2026-04-08');
  });

  test('월 경계 (4월 1일 → 3월 31일)', () => {
    expect(getPreviousDay('2026-04-01')).toBe('2026-03-31');
  });

  test('연도 경계 (1월 1일 → 전년 12월 31일)', () => {
    expect(getPreviousDay('2026-01-01')).toBe('2025-12-31');
  });

  test('윤년 (2024-03-01 → 2024-02-29)', () => {
    expect(getPreviousDay('2024-03-01')).toBe('2024-02-29');
  });

  test('비윤년 (2025-03-01 → 2025-02-28)', () => {
    expect(getPreviousDay('2025-03-01')).toBe('2025-02-28');
  });
});

describe('computeNewStreak', () => {
  test('첫 읽기 (lastReadDate = null)', () => {
    const result = computeNewStreak(0, 0, null, '2026-04-09');
    expect(result).toEqual({ newStreak: 1, newLongest: 1 });
  });

  test('연속 읽기 (어제 읽음)', () => {
    const result = computeNewStreak(5, 10, '2026-04-08', '2026-04-09');
    expect(result).toEqual({ newStreak: 6, newLongest: 10 });
  });

  test('최장 스트릭 갱신', () => {
    const result = computeNewStreak(10, 10, '2026-04-08', '2026-04-09');
    expect(result).toEqual({ newStreak: 11, newLongest: 11 });
  });

  test('스트릭 리셋 (하루 미완료)', () => {
    const result = computeNewStreak(5, 10, '2026-04-07', '2026-04-09');
    expect(result).toEqual({ newStreak: 1, newLongest: 10 });
  });

  test('같은 날 두 번째 챕터 (스트릭 유지)', () => {
    const result = computeNewStreak(3, 5, '2026-04-09', '2026-04-09');
    expect(result).toEqual({ newStreak: 3, newLongest: 5 });
  });

  test('오랜 공백 후 재시작', () => {
    const result = computeNewStreak(7, 30, '2025-12-31', '2026-04-09');
    expect(result).toEqual({ newStreak: 1, newLongest: 30 });
  });
});

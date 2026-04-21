import {
  parsePrayerNote,
  filterPrayerMeditations,
  searchPrayerMeditations,
  toggleAnsweredNote,
  makePrayerNote,
} from '../../utils/prayer-utils';
import type { Meditation } from '../../db/meditations';

// 테스트용 Meditation 생성 헬퍼
function makeM(id: number, note: string): Meditation {
  return { id, bookId: 1, chapter: 1, note, createdAt: '2026-01-01T00:00:00.000Z' };
}

describe('parsePrayerNote', () => {
  test('올바른 기도제목 파싱', () => {
    const note = JSON.stringify({ type: 'prayer', content: '건강을 위해', is_answered: false });
    const result = parsePrayerNote(note);
    expect(result).toEqual({ type: 'prayer', content: '건강을 위해', is_answered: false });
  });

  test('type이 다른 JSON은 null 반환', () => {
    const note = JSON.stringify({ type: 'memo', text: '메모' });
    expect(parsePrayerNote(note)).toBeNull();
  });

  test('JSON이 아닌 문자열은 null 반환', () => {
    expect(parsePrayerNote('일반 텍스트')).toBeNull();
  });

  test('is_answered 없으면 false 기본값', () => {
    const note = JSON.stringify({ type: 'prayer', content: '테스트' });
    const result = parsePrayerNote(note);
    expect(result?.is_answered).toBe(false);
  });

  test('응답된 기도제목 파싱', () => {
    const note = JSON.stringify({ type: 'prayer', content: '취직 기도', is_answered: true });
    const result = parsePrayerNote(note);
    expect(result?.is_answered).toBe(true);
  });
});

describe('filterPrayerMeditations', () => {
  test('기도제목만 필터링', () => {
    const meditations: Meditation[] = [
      makeM(1, JSON.stringify({ type: 'prayer', content: '기도1', is_answered: false })),
      makeM(2, JSON.stringify({ type: 'memo', text: '메모' })),
      makeM(3, JSON.stringify({ type: 'prayer', content: '기도2', is_answered: true })),
      makeM(4, '일반텍스트'),
    ];
    const result = filterPrayerMeditations(meditations);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(3);
  });

  test('빈 배열 입력 시 빈 배열 반환', () => {
    expect(filterPrayerMeditations([])).toEqual([]);
  });
});

describe('searchPrayerMeditations', () => {
  const meditations: Meditation[] = [
    makeM(1, JSON.stringify({ type: 'prayer', content: '가족의 건강을 위해', is_answered: false })),
    makeM(2, JSON.stringify({ type: 'prayer', content: '취직을 위해', is_answered: false })),
    makeM(3, JSON.stringify({ type: 'memo', text: '건강 메모' })),
  ];

  test('query 없으면 기도제목 전체 반환', () => {
    const result = searchPrayerMeditations(meditations, '');
    expect(result).toHaveLength(2);
  });

  test('content 필드로 검색', () => {
    const result = searchPrayerMeditations(meditations, '건강');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('memo type은 검색에서 제외', () => {
    const result = searchPrayerMeditations(meditations, '건강 메모');
    expect(result).toHaveLength(0);
  });

  test('대소문자 무관 검색', () => {
    const m: Meditation[] = [
      makeM(1, JSON.stringify({ type: 'prayer', content: 'Healing', is_answered: false })),
    ];
    expect(searchPrayerMeditations(m, 'healing')).toHaveLength(1);
  });
});

describe('toggleAnsweredNote', () => {
  test('is_answered false → true', () => {
    const note = JSON.stringify({ type: 'prayer', content: '기도', is_answered: false });
    const updated = toggleAnsweredNote(note, true);
    expect(JSON.parse(updated).is_answered).toBe(true);
  });

  test('is_answered true → false', () => {
    const note = JSON.stringify({ type: 'prayer', content: '기도', is_answered: true });
    const updated = toggleAnsweredNote(note, false);
    expect(JSON.parse(updated).is_answered).toBe(false);
  });

  test('content 등 다른 필드 유지', () => {
    const note = JSON.stringify({ type: 'prayer', content: '내용', is_answered: false });
    const updated = JSON.parse(toggleAnsweredNote(note, true));
    expect(updated.content).toBe('내용');
    expect(updated.type).toBe('prayer');
  });
});

describe('makePrayerNote', () => {
  test('올바른 기도제목 JSON 생성', () => {
    const note = makePrayerNote('취직 기도');
    const parsed = JSON.parse(note);
    expect(parsed.type).toBe('prayer');
    expect(parsed.content).toBe('취직 기도');
    expect(parsed.is_answered).toBe(false);
  });

  test('앞뒤 공백 제거', () => {
    const note = makePrayerNote('  기도제목  ');
    const parsed = JSON.parse(note);
    expect(parsed.content).toBe('기도제목');
  });
});

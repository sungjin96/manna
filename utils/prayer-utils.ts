import { Meditation } from '../db/meditations';

export interface PrayerNote {
  type: 'prayer';
  content: string;
  is_answered: boolean;
}

/**
 * note JSON을 파싱해 PrayerNote를 반환.
 * 기도제목이 아니거나 파싱 실패 시 null 반환.
 */
export function parsePrayerNote(note: string): PrayerNote | null {
  try {
    const parsed = JSON.parse(note);
    if (parsed?.type === 'prayer' && typeof parsed.content === 'string') {
      return {
        type: 'prayer',
        content: parsed.content,
        is_answered: Boolean(parsed.is_answered),
      };
    }
  } catch {}
  return null;
}

/**
 * Meditation 목록에서 type='prayer'인 항목만 필터링해 반환.
 */
export function filterPrayerMeditations(meditations: Meditation[]): Meditation[] {
  return meditations.filter(m => parsePrayerNote(m.note) !== null);
}

/**
 * 기도제목 content 필드로 검색 (클라이언트 JSON 파싱 기반).
 */
export function searchPrayerMeditations(meditations: Meditation[], query: string): Meditation[] {
  const prayers = filterPrayerMeditations(meditations);
  if (!query.trim()) return prayers;
  const q = query.trim().toLowerCase();
  return prayers.filter(m => {
    const p = parsePrayerNote(m.note);
    return p?.content.toLowerCase().includes(q);
  });
}

/**
 * 기도제목 note에서 is_answered 업데이트 후 직렬화.
 */
export function toggleAnsweredNote(note: string, is_answered: boolean): string {
  try {
    const parsed = JSON.parse(note);
    return JSON.stringify({ ...parsed, is_answered });
  } catch {
    return note;
  }
}

/**
 * 새 기도제목 note 직렬화.
 */
export function makePrayerNote(content: string): string {
  const note: PrayerNote = { type: 'prayer', content: content.trim(), is_answered: false };
  return JSON.stringify(note);
}

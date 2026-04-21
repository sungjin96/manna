const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // UTC+9

/**
 * 현재 KST 날짜를 YYYY-MM-DD 형식으로 반환.
 */
export function getKSTDateString(now?: Date): string {
  const d = now ? new Date(now.getTime()) : new Date();
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * YYYY-MM-DD 날짜 문자열에서 해당 연도의 몇 번째 날인지 반환 (1-based).
 * 365개 구절 배열의 인덱스 계산에 사용.
 */
export function getDayOfYear(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(year, 0, 1));
  const target = new Date(Date.UTC(year, month - 1, day));
  const diff = target.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
}

export function getPreviousDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeNewStreak(
  currentStreak: number,
  longestStreak: number,
  lastReadDate: string | null,
  today: string
): { newStreak: number; newLongest: number } {
  if (lastReadDate === today) {
    // Already read today — streak unchanged
    return { newStreak: currentStreak, newLongest: longestStreak };
  }

  const yesterday = getPreviousDay(today);
  const streakContinues = lastReadDate === yesterday;
  const newStreak = streakContinues ? currentStreak + 1 : 1;
  const newLongest = Math.max(newStreak, longestStreak);
  return { newStreak, newLongest };
}

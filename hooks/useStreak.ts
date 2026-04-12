import { useCallback, useEffect, useState } from 'react';
import { getStats, UserStats } from '../db/stats';

export function useStreak() {
  const [stats, setStats] = useState<UserStats>({
    currentStreak: 0,
    longestStreak: 0,
    totalChapters: 0,
    lastReadDate: null,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const s = await getStats();
    setStats(s);
  }, []);

  useEffect(() => {
    getStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  return { stats, loading, refresh };
}

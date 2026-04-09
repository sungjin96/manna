import { useEffect, useState } from 'react';
import { getAllCompletedChapters } from '../db/readings';

export function useReadingProgress() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const set = await getAllCompletedChapters();
    setCompleted(set);
  };

  useEffect(() => {
    getAllCompletedChapters()
      .then(setCompleted)
      .finally(() => setLoading(false));
  }, []);

  return { completed, loading, refresh };
}

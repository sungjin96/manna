import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { getAllCompletedChapters } from '../db/readings';

export function useReadingProgress() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const set = await getAllCompletedChapters();
    setCompleted(set);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getAllCompletedChapters().then((set) => {
        if (active) {
          setCompleted(set);
          setLoading(false);
        }
      });
      return () => { active = false; };
    }, [])
  );

  return { completed, loading, refresh };
}

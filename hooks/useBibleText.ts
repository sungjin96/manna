import { useEffect, useState } from 'react';
import { getChapter, Verse } from '../db/bible';

export function useBibleText(bookId: number, chapter: number) {
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getChapter(bookId, chapter)
      .then(setVerses)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [bookId, chapter]);

  return { verses, loading, error };
}

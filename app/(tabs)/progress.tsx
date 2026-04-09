import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BOOKS } from '../../constants/books';
import { useReadingProgress } from '../../hooks/useReadingProgress';

// Flatten accordion structure: either a book header or a chapter item
type AccordionItem =
  | { type: 'header'; bookId: number }
  | { type: 'chapter'; bookId: number; chapter: number };

export default function ProgressScreen() {
  const router = useRouter();
  const { completed, loading } = useReadingProgress();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleBook = useCallback((bookId: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }, []);

  // Memoized flat list — only recomputes when expanded set changes
  const items = useMemo<AccordionItem[]>(() => {
    const out: AccordionItem[] = [];
    for (const book of BOOKS) {
      out.push({ type: 'header', bookId: book.id });
      if (expanded.has(book.id)) {
        for (let ch = 1; ch <= book.chapters; ch++) {
          out.push({ type: 'chapter', bookId: book.id, chapter: ch });
        }
      }
    }
    return out;
  }, [expanded]);

  const renderItem = useCallback(
    ({ item }: { item: AccordionItem }) => {
      if (item.type === 'header') {
        const book = BOOKS[item.bookId - 1];
        const doneCount = Array.from({ length: book.chapters }, (_, i) =>
          completed.has(`${book.id}:${i + 1}`) ? 1 : 0
        ).reduce((a: number, b: number) => a + b, 0);
        const isOpen = expanded.has(book.id);

        return (
          <Pressable style={styles.bookRow} onPress={() => toggleBook(book.id)}>
            <View style={styles.bookInfo}>
              <Text style={styles.bookName}>{book.name}</Text>
              <Text style={styles.bookProgress}>
                {doneCount}/{book.chapters}
              </Text>
            </View>
            <View style={[styles.progressBar]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(doneCount / book.chapters) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
          </Pressable>
        );
      }

      // chapter item
      const key = `${item.bookId}:${item.chapter}`;
      const done = completed.has(key);
      return (
        <Pressable
          style={styles.chapterRow}
          onPress={() =>
            router.push(`/read/${item.bookId}/${item.chapter}`)
          }
        >
          <Text style={[styles.chapterNum, done && styles.chapterDone]}>
            {item.chapter}장
          </Text>
          {done && <Text style={styles.checkmark}>✓</Text>}
        </Pressable>
      );
    },
    [completed, expanded, toggleBook, router]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>불러오는 중...</Text>
      </View>
    );
  }

  const totalDone = completed.size;
  const totalChapters = 1189;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>읽기 진행률</Text>
        <Text style={styles.headerSub}>
          {totalDone} / {totalChapters} 챕터
        </Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={item =>
          item.type === 'header'
            ? `h-${item.bookId}`
            : `c-${item.bookId}-${item.chapter}`
        }
        renderItem={renderItem}
        removeClippedSubviews
        maxToRenderPerBatch={20}
        windowSize={10}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#999' },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  headerSub: { fontSize: 14, color: '#888', marginTop: 2 },
  bookRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bookInfo: { flex: 1 },
  bookName: { fontSize: 15, fontWeight: '600' },
  bookProgress: { fontSize: 12, color: '#999', marginTop: 2 },
  progressBar: {
    width: 80,
    height: 4,
    backgroundColor: '#eee',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#4A90D9', borderRadius: 2 },
  chevron: { fontSize: 12, color: '#bbb', width: 16, textAlign: 'center' },
  chapterRow: {
    paddingHorizontal: 32,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#f8f8f8',
  },
  chapterNum: { fontSize: 14, color: '#555' },
  chapterDone: { color: '#4A90D9' },
  checkmark: { fontSize: 14, color: '#4A90D9' },
});

import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BOOKS } from '../../constants/books';
import { useReadingProgress } from '../../hooks/useReadingProgress';
import { theme } from '../../constants/theme';

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
        const pct = (doneCount / book.chapters) * 100;

        return (
          <Pressable style={styles.bookRow} onPress={() => toggleBook(book.id)}>
            <View style={styles.bookInfo}>
              <Text style={styles.bookName}>{book.name}</Text>
              <Text style={styles.bookProgress}>
                {doneCount}/{book.chapters}
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
            </View>
            <MaterialCommunityIcons
              name={isOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={theme.textMuted}
            />
          </Pressable>
        );
      }

      const key = `${item.bookId}:${item.chapter}`;
      const done = completed.has(key);
      return (
        <Pressable
          style={styles.chapterRow}
          onPress={() => router.push(`/read/${item.bookId}/${item.chapter}`)}
        >
          <Text style={[styles.chapterNum, done && styles.chapterDone]}>
            {item.chapter}장
          </Text>
          {done && (
            <MaterialCommunityIcons name="check-circle" size={16} color={theme.gold} />
          )}
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>진행률</Text>
        <Text style={styles.headerSub}>{totalDone} / 1189 챕터</Text>
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
  container: { flex: 1, backgroundColor: theme.bg },
  center: {
    flex: 1,
    backgroundColor: theme.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { color: theme.textMuted, fontSize: 14 },
  header: {
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.text,
    letterSpacing: 0.3,
  },
  headerSub: { fontSize: 13, color: theme.textMuted, marginTop: 4 },
  bookRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bookInfo: { flex: 1 },
  bookName: { fontSize: 15, fontWeight: '600', color: theme.text },
  bookProgress: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  progressBar: {
    width: 72,
    height: 3,
    backgroundColor: theme.goldBg,
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.goldBorder,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.gold,
    borderRadius: 2,
  },
  chapterRow: {
    paddingHorizontal: 36,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  chapterNum: { fontSize: 14, color: theme.textSub },
  chapterDone: { color: theme.gold, fontWeight: '600' },
});

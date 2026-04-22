import { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BOOKS } from '../constants/books';
import { theme } from '../constants/theme';

interface Props {
  bookId: number | null;
  completed: Set<string>;
  onClose: () => void;
}

export default function ChapterSheet({ bookId, completed, onClose }: Props) {
  const router = useRouter();
  const { height: SCREEN_H } = useWindowDimensions();
  const book = bookId ? BOOKS.find(b => b.id === bookId) : null;
  const sheetY = useRef(new Animated.Value(SCREEN_H)).current;

  // Open animation
  useEffect(() => {
    if (bookId !== null) {
      sheetY.setValue(SCREEN_H);
      Animated.spring(sheetY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 11,
      }).start();
    }
  }, [bookId]);

  // Drag to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 4,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) sheetY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 80 || vy > 0.5) {
          dismiss();
        } else {
          Animated.spring(sheetY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 12,
          }).start();
        }
      },
    })
  ).current;

  function dismiss() {
    Animated.timing(sheetY, {
      toValue: SCREEN_H,
      duration: 260,
      useNativeDriver: true,
    }).start(() => onClose());
  }

  if (!book) return null;

  let doneCount = 0;
  for (let ch = 1; ch <= book.chapters; ch++) {
    if (completed.has(`${book.id}:${ch}`)) doneCount++;
  }
  const pct = Math.round((doneCount / book.chapters) * 100);

  return (
    <Modal visible={bookId !== null} transparent animationType="none">
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={dismiss} />
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}
        >
          {/* Drag handle */}
          <View {...panResponder.panHandlers}>
            <View style={styles.handleArea}>
              <View style={styles.handleBar} />
            </View>
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.bookName}>{book.name}</Text>
              <Text style={styles.bookProgress}>
                {doneCount} / {book.chapters}장 · {pct}%
              </Text>
            </View>
            {doneCount === book.chapters && (
              <MaterialCommunityIcons name="check-circle" size={24} color={theme.gold} />
            )}
          </View>

          {/* Progress bar */}
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
          </View>

          {/* Chapter grid — centered */}
          <ScrollView
            contentContainerStyle={styles.chapterScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.chapterGrid}>
              {Array.from({ length: book.chapters }, (_, i) => {
                const ch = i + 1;
                const isDone = completed.has(`${book.id}:${ch}`);
                return (
                  <Pressable
                    key={ch}
                    style={({ pressed }) => [
                      styles.chapterBtn,
                      isDone && styles.chapterBtnDone,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      dismiss();
                      setTimeout(() => router.push(`/read/${book.id}/${ch}`), 280);
                    }}
                    accessibilityLabel={`${ch}장 ${isDone ? '읽음' : '안읽음'}`}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.chapterNum, isDone && styles.chapterNumDone]}>
                      {ch}
                    </Text>
                    {isDone && (
                      <MaterialCommunityIcons name="check" size={11} color={theme.bg} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.goldBorder,
  },
  handleArea: {
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.borderSubtle,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  bookName: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.text,
  },
  bookProgress: {
    fontSize: 13,
    color: theme.textMuted,
  },
  progressBar: {
    height: 4,
    backgroundColor: theme.goldBg,
    borderRadius: 2,
    overflow: 'hidden',
    marginHorizontal: 24,
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.gold,
    borderRadius: 2,
  },
  chapterScroll: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  chapterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  chapterBtn: {
    width: 54,
    height: 46,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  chapterBtnDone: {
    backgroundColor: theme.gold,
    borderColor: theme.gold,
  },
  chapterNum: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textSub,
  },
  chapterNumDone: {
    color: theme.bg,
  },
});

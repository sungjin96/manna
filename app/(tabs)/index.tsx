import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useStreak } from '../../hooks/useStreak';
import { BOOKS } from '../../constants/books';

// Pick a "continue reading" book/chapter — first incomplete chapter (Genesis 1 as fallback)
function getNextChapter(lastReadDate: string | null): { bookId: number; chapter: number } {
  // MVP: always start from Genesis 1 until we track last-read position
  return { bookId: 1, chapter: 1 };
}

export default function HomeScreen() {
  const router = useRouter();
  const { stats, loading, refresh } = useStreak();

  // Refresh stats every time home tab is focused
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const { bookId, chapter } = getNextChapter(stats.lastReadDate);
  const book = BOOKS.find(b => b.id === bookId);

  return (
    <View style={styles.container}>
      <View style={styles.streakSection}>
        <Text style={styles.streakEmoji}>🔥</Text>
        <Text style={styles.streakCount}>{stats.currentStreak}</Text>
        <Text style={styles.streakLabel}>일 연속 읽기</Text>
        {stats.longestStreak > 0 && (
          <Text style={styles.longestStreak}>
            최장 기록: {stats.longestStreak}일
          </Text>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{stats.totalChapters}</Text>
          <Text style={styles.statLabel}>읽은 챕터</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>
            {Math.round((stats.totalChapters / 1189) * 100)}%
          </Text>
          <Text style={styles.statLabel}>전체 진행률</Text>
        </View>
      </View>

      <Pressable
        style={styles.readBtn}
        onPress={() => router.push(`/read/${bookId}/${chapter}`)}
      >
        <Text style={styles.readBtnTitle}>오늘 읽기</Text>
        <Text style={styles.readBtnSub}>
          {book?.name} {chapter}장
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 60,
  },
  streakSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  streakEmoji: { fontSize: 56 },
  streakCount: { fontSize: 72, fontWeight: '800', color: '#FF6B35', lineHeight: 80 },
  streakLabel: { fontSize: 18, color: '#666', marginTop: 4 },
  longestStreak: { fontSize: 13, color: '#bbb', marginTop: 8 },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f7f9fc',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statNum: { fontSize: 28, fontWeight: '700', color: '#222' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4 },
  readBtn: {
    backgroundColor: '#4A90D9',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  readBtnTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  readBtnSub: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
});

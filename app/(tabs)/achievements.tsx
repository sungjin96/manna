import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getStats, UserStats } from '../../db/stats';
import { getAllCompletedChapters } from '../../db/readings';
import { getAllMeditations } from '../../db/meditations';
import { BOOKS } from '../../constants/books';
import { theme } from '../../constants/theme';

type BadgeIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Badge {
  id: string;
  icon: BadgeIconName;
  title: string;
  desc: string;
  check: (stats: UserStats, completed: Set<string>, meditationCount: number) => boolean;
}

const BADGES: Badge[] = [
  {
    id: 'first_step',
    icon: 'shoe-print',
    title: '첫 걸음',
    desc: '첫 챕터를 읽었습니다',
    check: (s) => s.totalChapters >= 1,
  },
  {
    id: 'streak_3',
    icon: 'fire',
    title: '3일 연속',
    desc: '3일 연속 읽기 달성',
    check: (s) => s.longestStreak >= 3,
  },
  {
    id: 'streak_7',
    icon: 'calendar-week',
    title: '일주일 연속',
    desc: '7일 연속 읽기 달성',
    check: (s) => s.longestStreak >= 7,
  },
  {
    id: 'streak_21',
    icon: 'crown',
    title: '습관 형성',
    desc: '21일 연속 읽기 — 습관이 됐습니다',
    check: (s) => s.longestStreak >= 21,
  },
  {
    id: 'streak_100',
    icon: 'fire-circle',
    title: '100일 연속',
    desc: '100일 연속 읽기 — 경이롭습니다',
    check: (s) => s.longestStreak >= 100,
  },
  {
    id: 'chapters_10',
    icon: 'book-open-page-variant',
    title: '열 챕터',
    desc: '10챕터를 읽었습니다',
    check: (s) => s.totalChapters >= 10,
  },
  {
    id: 'chapters_50',
    icon: 'bookshelf',
    title: '오십 챕터',
    desc: '50챕터 완독',
    check: (s) => s.totalChapters >= 50,
  },
  {
    id: 'chapters_100',
    icon: 'book-multiple',
    title: '백 챕터',
    desc: '100챕터 완독',
    check: (s) => s.totalChapters >= 100,
  },
  {
    id: 'genesis_done',
    icon: 'alpha-g-circle',
    title: '창세기 완독',
    desc: '창세기 50장 전부 읽기',
    check: (_, completed) => {
      const genesis = BOOKS.find(b => b.id === 1)!;
      for (let ch = 1; ch <= genesis.chapters; ch++) {
        if (!completed.has(`1:${ch}`)) return false;
      }
      return true;
    },
  },
  {
    id: 'psalms_done',
    icon: 'music-note',
    title: '시편 완독',
    desc: '시편 150편 전부 읽기',
    check: (_, completed) => {
      const psalms = BOOKS.find(b => b.id === 19)!;
      for (let ch = 1; ch <= psalms.chapters; ch++) {
        if (!completed.has(`19:${ch}`)) return false;
      }
      return true;
    },
  },
  {
    id: 'new_testament',
    icon: 'cross',
    title: '신약 완독',
    desc: '신약 27권 전부 읽기',
    check: (_, completed) => {
      const ntBooks = BOOKS.filter(b => b.testament === 'new');
      for (const book of ntBooks) {
        for (let ch = 1; ch <= book.chapters; ch++) {
          if (!completed.has(`${book.id}:${ch}`)) return false;
        }
      }
      return true;
    },
  },
  {
    id: 'meditation_1',
    icon: 'notebook-edit-outline',
    title: '첫 묵상',
    desc: '첫 묵상 기록을 남겼습니다',
    check: (_, __, mc) => mc >= 1,
  },
  {
    id: 'meditation_10',
    icon: 'notebook-multiple',
    title: '묵상가',
    desc: '10개의 묵상 기록',
    check: (_, __, mc) => mc >= 10,
  },
  {
    id: 'meditation_20',
    icon: 'pen-plus',
    title: '깊이 묵상',
    desc: '20개의 묵상 기록',
    check: (_, __, mc) => mc >= 20,
  },
  {
    id: 'bible_complete',
    icon: 'star-four-points',
    title: '성경 완독',
    desc: '1189챕터 전부 완독 — 경이로운 여정',
    check: (s) => s.totalChapters >= 1189,
  },
];

export default function AchievementsScreen() {
  const [stats, setStats] = useState<UserStats>({ currentStreak: 0, longestStreak: 0, totalChapters: 0, lastReadDate: null });
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [meditationCount, setMeditationCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      Promise.all([
        getStats(),
        getAllCompletedChapters(),
        getAllMeditations().then(m => m.length),
      ]).then(([s, c, mc]) => {
        setStats(s);
        setCompleted(c);
        setMeditationCount(mc);
      }).finally(() => setLoading(false));
    }, [])
  );

  const earnedCount = BADGES.filter(b => b.check(stats, completed, meditationCount)).length;

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>불러오는 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>업적</Text>
        <Text style={styles.headerSub}>{earnedCount} / {BADGES.length}</Text>
      </View>

      <FlatList
        data={BADGES}
        keyExtractor={b => b.id}
        numColumns={3}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => {
          const earned = item.check(stats, completed, meditationCount);
          return (
            <View style={[styles.badge, !earned && styles.badgeLocked]}>
              <MaterialCommunityIcons
                name={item.icon}
                size={32}
                color={earned ? theme.gold : theme.textMuted}
                style={!earned && styles.iconLocked}
              />
              <Text style={[styles.badgeTitle, !earned && styles.badgeTitleLocked]}>
                {item.title}
              </Text>
              <Text style={styles.badgeDesc} numberOfLines={2}>
                {item.desc}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' },
  muted: { color: theme.textMuted, fontSize: 14 },

  header: {
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },
  headerSub: { fontSize: 13, color: theme.textMuted },

  grid: { padding: 12 },
  row: { gap: 10, marginBottom: 10 },
  badge: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: theme.goldBorder,
    minHeight: 110,
    justifyContent: 'center',
  },
  badgeLocked: {
    borderColor: theme.borderSubtle,
    backgroundColor: 'rgba(19,17,31,0.5)',
  },
  iconLocked: { opacity: 0.35 },
  badgeTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.gold,
    textAlign: 'center',
  },
  badgeTitleLocked: { color: theme.textMuted },
  badgeDesc: {
    fontSize: 9,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 13,
  },
});

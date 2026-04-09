import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getStats, UserStats } from '../../db/stats';
import { getAllCompletedChapters } from '../../db/readings';
import { getAllMeditations } from '../../db/meditations';
import { BOOKS } from '../../constants/books';
import { theme } from '../../constants/theme';

type BadgeIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type Tier = 'bronze' | 'silver' | 'gold' | 'diamond';

const TIER_CONFIG: Record<Tier, { color: string; bg: string; ring: string; label: string }> = {
  bronze:  { color: '#CD7F32', bg: 'rgba(205,127,50,0.10)',  ring: 'rgba(205,127,50,0.40)',  label: 'BRONZE'  },
  silver:  { color: '#A8B0BB', bg: 'rgba(168,176,187,0.10)', ring: 'rgba(168,176,187,0.40)', label: 'SILVER'  },
  gold:    { color: '#D4A847', bg: 'rgba(212,168,71,0.10)',  ring: 'rgba(212,168,71,0.40)',  label: 'GOLD'    },
  diamond: { color: '#7EC8E3', bg: 'rgba(126,200,227,0.10)', ring: 'rgba(126,200,227,0.40)', label: 'DIAMOND' },
};

interface Badge {
  id: string;
  icon: BadgeIconName;
  title: string;
  desc: string;
  tier: Tier;
  check: (stats: UserStats, completed: Set<string>, meditationCount: number) => boolean;
}

const BADGES: Badge[] = [
  // ── Bronze ─────────────────────────────────────────────────────────────────
  {
    id: 'first_step', icon: 'shoe-print', title: '첫 걸음',
    desc: '첫 챕터를 읽었습니다', tier: 'bronze',
    check: (s) => s.totalChapters >= 1,
  },
  {
    id: 'streak_3', icon: 'fire', title: '3일 연속',
    desc: '3일 연속 읽기 달성', tier: 'bronze',
    check: (s) => s.longestStreak >= 3,
  },
  {
    id: 'chapters_10', icon: 'book-open-page-variant', title: '열 챕터',
    desc: '10챕터를 읽었습니다', tier: 'bronze',
    check: (s) => s.totalChapters >= 10,
  },
  {
    id: 'meditation_1', icon: 'notebook-edit-outline', title: '첫 묵상',
    desc: '첫 묵상 기록을 남겼습니다', tier: 'bronze',
    check: (_, __, mc) => mc >= 1,
  },
  // ── Silver ─────────────────────────────────────────────────────────────────
  {
    id: 'streak_7', icon: 'calendar-week', title: '일주일',
    desc: '7일 연속 읽기 달성', tier: 'silver',
    check: (s) => s.longestStreak >= 7,
  },
  {
    id: 'chapters_50', icon: 'bookshelf', title: '오십 챕터',
    desc: '50챕터 완독', tier: 'silver',
    check: (s) => s.totalChapters >= 50,
  },
  {
    id: 'meditation_10', icon: 'notebook-multiple', title: '묵상가',
    desc: '10개의 묵상 기록', tier: 'silver',
    check: (_, __, mc) => mc >= 10,
  },
  {
    id: 'genesis_done', icon: 'alpha-g-circle', title: '창세기',
    desc: '창세기 50장 전부 읽기', tier: 'silver',
    check: (_, completed) => {
      const book = BOOKS.find(b => b.id === 1)!;
      for (let ch = 1; ch <= book.chapters; ch++) {
        if (!completed.has(`1:${ch}`)) return false;
      }
      return true;
    },
  },
  // ── Gold ───────────────────────────────────────────────────────────────────
  {
    id: 'streak_21', icon: 'crown', title: '습관 형성',
    desc: '21일 연속 읽기 달성', tier: 'gold',
    check: (s) => s.longestStreak >= 21,
  },
  {
    id: 'chapters_100', icon: 'book-multiple', title: '백 챕터',
    desc: '100챕터 완독', tier: 'gold',
    check: (s) => s.totalChapters >= 100,
  },
  {
    id: 'meditation_20', icon: 'pen-plus', title: '깊이 묵상',
    desc: '20개의 묵상 기록', tier: 'gold',
    check: (_, __, mc) => mc >= 20,
  },
  {
    id: 'psalms_done', icon: 'music-note', title: '시편 완독',
    desc: '시편 150편 전부 읽기', tier: 'gold',
    check: (_, completed) => {
      const book = BOOKS.find(b => b.id === 19)!;
      for (let ch = 1; ch <= book.chapters; ch++) {
        if (!completed.has(`19:${ch}`)) return false;
      }
      return true;
    },
  },
  {
    id: 'new_testament', icon: 'cross', title: '신약 완독',
    desc: '신약 27권 전부 읽기', tier: 'gold',
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
  // ── Diamond ────────────────────────────────────────────────────────────────
  {
    id: 'streak_100', icon: 'fire-circle', title: '100일 연속',
    desc: '100일 연속 읽기', tier: 'diamond',
    check: (s) => s.longestStreak >= 100,
  },
  {
    id: 'bible_complete', icon: 'star-four-points', title: '성경 완독',
    desc: '1189챕터 전부 완독', tier: 'diamond',
    check: (s) => s.totalChapters >= 1189,
  },
];

const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'diamond'];

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ── Badge card ─────────────────────────────────────────────────────────────

function BadgeCard({
  badge,
  earned,
  shimmerX,
  pulseAnim,
}: {
  badge: Badge;
  earned: boolean;
  shimmerX: Animated.AnimatedInterpolation<number>;
  pulseAnim: Animated.Value;
}) {
  const tc = TIER_CONFIG[badge.tier];

  // Diamond badges get a pulsing outer glow
  const glowOpacity = badge.tier === 'diamond' && earned
    ? pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] })
    : undefined;

  return (
    <View style={[
      cardStyles.wrap,
      earned ? { borderColor: tc.color, backgroundColor: tc.bg } : cardStyles.wrapLocked,
    ]}>
      {/* Shimmer sweep for earned badges */}
      {earned && (
        <Animated.View
          style={[cardStyles.shimmer, { transform: [{ translateX: shimmerX }, { rotate: '25deg' }] }]}
        />
      )}

      {/* Diamond outer glow ring */}
      {glowOpacity && (
        <Animated.View style={[cardStyles.diamondGlow, { borderColor: tc.color, opacity: glowOpacity }]} />
      )}

      {/* Icon ring */}
      <View style={[
        cardStyles.iconRing,
        earned ? { borderColor: tc.ring } : cardStyles.iconRingLocked,
      ]}>
        <MaterialCommunityIcons
          name={badge.icon}
          size={26}
          color={earned ? tc.color : 'rgba(255,255,255,0.15)'}
        />
        {!earned && (
          <View style={cardStyles.lockOverlay}>
            <MaterialCommunityIcons name="lock-outline" size={11} color="rgba(255,255,255,0.25)" />
          </View>
        )}
      </View>

      {/* Title */}
      <Text
        style={[cardStyles.title, earned ? { color: tc.color } : cardStyles.titleLocked]}
        numberOfLines={1}
      >
        {badge.title}
      </Text>

      {/* Tier pill */}
      <View style={[
        cardStyles.pill,
        earned
          ? { backgroundColor: `${tc.color}1A`, borderColor: `${tc.color}44` }
          : cardStyles.pillLocked,
      ]}>
        <Text style={[cardStyles.pillText, earned ? { color: tc.color } : cardStyles.pillTextLocked]}>
          {tc.label}
        </Text>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function AchievementsScreen() {
  const [stats, setStats] = useState<UserStats>({
    currentStreak: 0, longestStreak: 0, totalChapters: 0, lastReadDate: null,
  });
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [meditationCount, setMeditationCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Shared shimmer (sweeps left → right, pauses, then repeats)
  const shimmer = useRef(new Animated.Value(0)).current;
  // Shared pulse for diamond tier
  const pulse = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(2800),
      ])
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ])
    );
    shimmerLoop.start();
    pulseLoop.start();
    return () => { shimmerLoop.stop(); pulseLoop.stop(); };
  }, []);

  const shimmerX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-120, 120] });

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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>뱃지</Text>
        <Text style={styles.headerSub}>{earnedCount} / {BADGES.length}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {TIERS.map(tier => {
          const tierBadges = BADGES.filter(b => b.tier === tier);
          const tierEarned = tierBadges.filter(b => b.check(stats, completed, meditationCount)).length;
          const tc = TIER_CONFIG[tier];

          return (
            <View key={tier} style={styles.section}>
              {/* Section header */}
              <View style={styles.sectionHeader}>
                <View style={[styles.tierDot, { backgroundColor: tc.color }]} />
                <Text style={[styles.sectionTitle, { color: tc.color }]}>{tc.label}</Text>
                <View style={styles.sectionDivider} />
                <Text style={styles.sectionCount}>{tierEarned}/{tierBadges.length}</Text>
              </View>

              {/* Badge grid */}
              {chunkArray(tierBadges, 3).map((row, rowIdx) => (
                <View key={rowIdx} style={styles.row}>
                  {row.map(badge => (
                    <BadgeCard
                      key={badge.id}
                      badge={badge}
                      earned={badge.check(stats, completed, meditationCount)}
                      shimmerX={shimmerX}
                      pulseAnim={pulse}
                    />
                  ))}
                  {/* Phantom items to keep grid aligned */}
                  {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
                    <View key={`ph-${i}`} style={cardStyles.phantom} />
                  ))}
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Card styles ────────────────────────────────────────────────────────────

const cardStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
    minHeight: 118,
    justifyContent: 'center',
    position: 'relative',
  },
  wrapLocked: {
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  shimmer: {
    position: 'absolute',
    top: -30,
    left: '50%',
    width: 28,
    height: 200,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  diamondGlow: {
    position: 'absolute',
    inset: -3,
    borderRadius: 18,
    borderWidth: 2,
  },
  iconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconRingLocked: {
    borderColor: 'rgba(255,255,255,0.08)',
  },
  lockOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  titleLocked: {
    color: 'rgba(255,255,255,0.22)',
  },
  pill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  pillLocked: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  pillText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  pillTextLocked: {
    color: 'rgba(255,255,255,0.15)',
  },
  phantom: {
    flex: 1,
  },
});

// ── Screen styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' },
  muted: { color: theme.textMuted, fontSize: 14 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },
  headerSub: { fontSize: 13, color: theme.textMuted },

  scroll: { padding: 16, paddingBottom: 40 },

  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tierDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  sectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sectionCount: {
    fontSize: 11,
    color: theme.textMuted,
  },

  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
});

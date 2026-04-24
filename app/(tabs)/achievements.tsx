import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getStats, UserStats } from '../../db/stats';
import { getAllCompletedChapters } from '../../db/readings';
import { getAllMeditations } from '../../db/meditations';
import { BOOKS } from '../../constants/books';
import { theme } from '../../constants/theme';

export type BadgeIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export type Tier = 'bronze' | 'silver' | 'gold' | 'diamond';

const TIER_CONFIG: Record<Tier, { color: string; bg: string; ring: string; label: string }> = {
  bronze:  { color: '#CD7F32', bg: 'rgba(205,127,50,0.10)',  ring: 'rgba(205,127,50,0.40)',  label: 'BRONZE'  },
  silver:  { color: '#A8B0BB', bg: 'rgba(168,176,187,0.10)', ring: 'rgba(168,176,187,0.40)', label: 'SILVER'  },
  gold:    { color: '#D4A847', bg: 'rgba(212,168,71,0.10)',  ring: 'rgba(212,168,71,0.40)',  label: 'GOLD'    },
  diamond: { color: '#7EC8E3', bg: 'rgba(126,200,227,0.10)', ring: 'rgba(126,200,227,0.40)', label: 'DIAMOND' },
};

export interface Badge {
  id: string;
  icon: BadgeIconName;
  title: string;
  desc: string;
  tier: Tier;
  check: (stats: UserStats, completed: Set<string>, meditationCount: number) => boolean;
}

export const BADGES: Badge[] = [
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
  {
    id: 'comeback_1', icon: 'run-fast', title: '돌아온 탕자',
    desc: '스트릭이 끊긴 후 다시 돌아왔습니다', tier: 'bronze',
    check: (s) => s.comebackCount >= 1,
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
    id: 'comeback_3', icon: 'heart-outline', title: '흔들리지 않는',
    desc: '3번 돌아와 묵상을 이어갔습니다', tier: 'silver',
    check: (s) => s.comebackCount >= 3,
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
  {
    id: 'comeback_10', icon: 'trophy-variant-outline', title: '은혜의 증인',
    desc: '10번 돌아와 묵상을 이어갔습니다', tier: 'gold',
    check: (s) => s.comebackCount >= 10,
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

// ── 66권 완독 뱃지 ─────────────────────────────────────────────────────────
//
// 등급 기준: 단순 장수가 아닌 「장수 × 내용 난이도」를 함께 고려
//
// Bronze  — 짧고 접근하기 쉬운 내러티브·서신
// Silver  — 중간 길이의 역사서·복음서·바울 서신
// Gold    — 길거나 율법·예언·신학적 밀도가 높은 책
// Diamond — 매우 길거나 묵시적으로 복잡한 책
//           (시편 150편, 이사야·예레미야·에스겔·요한계시록)

const BOOK_TIER_MAP: Record<number, Tier> = {
  // ── Bronze ─────────────────────────────────────────────────────────────────
  8:  'bronze', // 룻기       — 짧은 내러티브, 아름다운 이야기
  17: 'bronze', // 에스더     — 짧고 흥미로운 내러티브
  22: 'bronze', // 아가       — 짧은 시가
  25: 'bronze', // 예레미야애가 — 짧은 애도시
  29: 'bronze', // 요엘       — 짧은 예언
  31: 'bronze', // 오바댜     — 성경에서 가장 짧은 책
  32: 'bronze', // 요나       — 짧고 친숙한 이야기
  34: 'bronze', // 나훔       — 짧은 예언
  35: 'bronze', // 하박국     — 짧은 예언
  36: 'bronze', // 스바냐     — 짧은 예언
  37: 'bronze', // 학개       — 아주 짧음
  39: 'bronze', // 말라기     — 짧은 예언
  50: 'bronze', // 빌립보서   — 짧고 기쁨이 넘치는 서신
  51: 'bronze', // 골로새서   — 짧은 서신
  52: 'bronze', // 데살로니가전서 — 짧은 서신
  53: 'bronze', // 데살로니가후서 — 짧은 서신
  55: 'bronze', // 디모데후서 — 짧은 서신
  56: 'bronze', // 디도서     — 짧은 서신
  57: 'bronze', // 빌레몬서   — 1장, 개인 서신
  59: 'bronze', // 야고보서   — 짧고 실천적
  60: 'bronze', // 베드로전서 — 짧은 서신
  61: 'bronze', // 베드로후서 — 짧은 서신
  62: 'bronze', // 요한일서   — 짧은 서신
  63: 'bronze', // 요한이서   — 1장
  64: 'bronze', // 요한삼서   — 1장
  65: 'bronze', // 유다서     — 1장

  // ── Silver ─────────────────────────────────────────────────────────────────
  6:  'silver', // 여호수아   — 중간 길이 내러티브
  7:  'silver', // 사사기     — 중간 길이 내러티브
  9:  'silver', // 사무엘상   — 긴 편이지만 흥미로운 내러티브
  10: 'silver', // 사무엘하   — 내러티브
  11: 'silver', // 열왕기상   — 내러티브
  12: 'silver', // 열왕기하   — 내러티브
  15: 'silver', // 에스라     — 짧은 역사서
  16: 'silver', // 느헤미야   — 짧은 역사서
  21: 'silver', // 전도서     — 중간 길이 지혜서
  28: 'silver', // 호세아     — 중간 길이 예언
  30: 'silver', // 아모스     — 짧은 편의 예언
  33: 'silver', // 미가       — 짧은 예언이지만 신학적 깊이
  40: 'silver', // 마태복음   — 복음서
  41: 'silver', // 마가복음   — 가장 짧고 빠른 복음서
  42: 'silver', // 누가복음   — 복음서
  43: 'silver', // 요한복음   — 복음서
  44: 'silver', // 사도행전   — 내러티브, 읽기 쉬움
  46: 'silver', // 고린도전서 — 바울 서신
  47: 'silver', // 고린도후서 — 바울 서신
  48: 'silver', // 갈라디아서 — 바울 서신
  49: 'silver', // 에베소서   — 바울 서신
  54: 'silver', // 디모데전서 — 목회 서신

  // ── Gold ───────────────────────────────────────────────────────────────────
  1:  'gold',   // 창세기     — 50장, 내러티브+율법 혼합
  2:  'gold',   // 출애굽기   — 40장, 내러티브+율법
  3:  'gold',   // 레위기     — 율법 규례, 성경 완독의 최대 난관
  4:  'gold',   // 민수기     — 인구조사+율법, 중간에 지루해지는 구간
  5:  'gold',   // 신명기     — 모세의 긴 설교, 율법 반복
  13: 'gold',   // 역대상     — 9장까지 족보, 역사 기록 밀도 높음
  14: 'gold',   // 역대하     — 긴 역사서
  18: 'gold',   // 욥기       — 42장, 시가+논쟁, 신학적으로 무거움
  20: 'gold',   // 잠언       — 31장, 짧은 격언들의 밀집
  27: 'gold',   // 다니엘     — 전반 내러티브 + 후반 묵시, 복잡
  38: 'gold',   // 스가랴     — 14장이지만 묵시적 환상이 복잡
  45: 'gold',   // 로마서     — 신학 밀도 최고, 바울 서신 중 가장 어려움
  58: 'gold',   // 히브리서   — 구약 예형론 전제, 신학적으로 난이도 높음

  // ── Diamond ────────────────────────────────────────────────────────────────
  19: 'diamond', // 시편      — 150편, 성경에서 가장 긴 책
  23: 'diamond', // 이사야    — 66장, 메시아 예언의 복잡한 구조
  24: 'diamond', // 예레미야  — 52장, 긴 예언+역사+애가 혼합
  26: 'diamond', // 에스겔    — 48장, 복잡한 환상과 상징 (수레바퀴 등)
  66: 'diamond', // 요한계시록 — 22장이지만 묵시 문학 최고 난이도
};

export const BOOK_BADGES: Badge[] = BOOKS.map(book => ({
  id: `book_${book.id}`,
  icon: 'book-check' as BadgeIconName,
  title: book.name,
  desc: `${book.name} ${book.chapters}장 전부 읽기`,
  tier: BOOK_TIER_MAP[book.id] ?? 'bronze',
  check: (_: UserStats, completed: Set<string>) => {
    for (let ch = 1; ch <= book.chapters; ch++) {
      if (!completed.has(`${book.id}:${ch}`)) return false;
    }
    return true;
  },
}));

// ── Layout ─────────────────────────────────────────────────────────────────

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
  const { width: windowWidth } = useWindowDimensions();
  // 32 = contentContainerPadding (16×2), 16 = 2 gaps of 8 between 3 cards
  const cardW = Math.floor((windowWidth - 32 - 16) / 3);
  const tc = TIER_CONFIG[badge.tier];

  // Diamond badges get a pulsing outer glow
  const glowOpacity = badge.tier === 'diamond' && earned
    ? pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] })
    : undefined;

  return (
    <View style={[
      cardStyles.wrap,
      { width: cardW },
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
  const { width: windowWidth } = useWindowDimensions();
  const cardW = Math.floor((windowWidth - 32 - 16) / 3);
  const [stats, setStats] = useState<UserStats>({
    currentStreak: 0, longestStreak: 0, totalChapters: 0, lastReadDate: null,
    freezesRemaining: 2, freezesMonth: null, comebackCount: 0,
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

  const allBadges = [...BADGES, ...BOOK_BADGES];
  const earnedCount = allBadges.filter(b => b.check(stats, completed, meditationCount)).length;

  const otBooks = BOOK_BADGES.filter(b => {
    const book = BOOKS.find(bk => `book_${bk.id}` === b.id);
    return book?.testament === 'old';
  });
  const ntBooks = BOOK_BADGES.filter(b => {
    const book = BOOKS.find(bk => `book_${bk.id}` === b.id);
    return book?.testament === 'new';
  });

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
        <Text style={styles.headerSub}>{earnedCount} / {allBadges.length}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── 업적 뱃지 ── */}
        {TIERS.map(tier => {
          const tierBadges = BADGES.filter(b => b.tier === tier);
          const tierEarned = tierBadges.filter(b => b.check(stats, completed, meditationCount)).length;
          const tc = TIER_CONFIG[tier];

          return (
            <View key={tier} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.tierDot, { backgroundColor: tc.color }]} />
                <Text style={[styles.sectionTitle, { color: tc.color }]}>{tc.label}</Text>
                <View style={styles.sectionDivider} />
                <Text style={styles.sectionCount}>{tierEarned}/{tierBadges.length}</Text>
              </View>

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
                  {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
                    <View key={`ph-${i}`} style={[cardStyles.phantom, { width: cardW }]} />
                  ))}
                </View>
              ))}
            </View>
          );
        })}

        {/* ── 성경 66권 ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.tierDot, { backgroundColor: '#D4A847' }]} />
            <Text style={[styles.sectionTitle, { color: '#D4A847' }]}>성경 66권</Text>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionCount}>
              {BOOK_BADGES.filter(b => b.check(stats, completed, meditationCount)).length}/{BOOK_BADGES.length}
            </Text>
          </View>

          {/* 구약 */}
          <Text style={[styles.bookSubTitle, { color: '#A8B0BB' }]}>
            구약 {otBooks.filter(b => b.check(stats, completed, meditationCount)).length}/{otBooks.length}
          </Text>
          {chunkArray(otBooks, 3).map((row, rowIdx) => (
            <View key={`ot-${rowIdx}`} style={styles.row}>
              {row.map(badge => (
                <BadgeCard
                  key={badge.id}
                  badge={badge}
                  earned={badge.check(stats, completed, meditationCount)}
                  shimmerX={shimmerX}
                  pulseAnim={pulse}
                />
              ))}
              {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
                <View key={`ph-${i}`} style={cardStyles.phantom} />
              ))}
            </View>
          ))}

          {/* 신약 */}
          <Text style={[styles.bookSubTitle, { color: '#A8B0BB', marginTop: 12 }]}>
            신약 {ntBooks.filter(b => b.check(stats, completed, meditationCount)).length}/{ntBooks.length}
          </Text>
          {chunkArray(ntBooks, 3).map((row, rowIdx) => (
            <View key={`nt-${rowIdx}`} style={styles.row}>
              {row.map(badge => (
                <BadgeCard
                  key={badge.id}
                  badge={badge}
                  earned={badge.check(stats, completed, meditationCount)}
                  shimmerX={shimmerX}
                  pulseAnim={pulse}
                />
              ))}
              {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
                <View key={`ph-${i}`} style={cardStyles.phantom} />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Card styles ────────────────────────────────────────────────────────────

const cardStyles = StyleSheet.create({
  wrap: {
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
  phantom: {},
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
  bookSubTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
});

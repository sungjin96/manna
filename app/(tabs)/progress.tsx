import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BOOKS } from '../../constants/books';
import { useReadingProgress } from '../../hooks/useReadingProgress';
import { checkAIEntitlement, purchasePremium } from '../../utils/subscriptions';
import { getStats, type UserStats } from '../../db/stats';
import { getMeditationCount } from '../../db/meditations';
import { BADGES, BOOK_BADGES, type Badge, type Tier } from './achievements';
import StreakHeatmap from '../../components/StreakHeatmap';
import PaywallSheet from '../../components/PaywallSheet';
import BookGrid from '../../components/BookGrid';
import ChapterSheet from '../../components/ChapterSheet';
import { theme } from '../../constants/theme';

const TIER_COLORS: Record<Tier, string> = {
  bronze: '#CD7F32', silver: '#A8B0BB', gold: '#D4A847', diamond: '#7EC8E3',
};

const TIER_ORDER: Tier[] = ['diamond', 'gold', 'silver', 'bronze'];
const TIER_LABELS: Record<Tier, string> = {
  bronze: 'BRONZE', silver: 'SILVER', gold: 'GOLD', diamond: 'DIAMOND',
};

export default function ProgressScreen() {
  const router = useRouter();
  const { completed, loading } = useReadingProgress();
  const [isPro, setIsPro] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallLoading, setPaywallLoading] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [meditationCount, setMeditationCount] = useState(0);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);

  // Animation
  const progressAnim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      checkAIEntitlement().then(setIsPro).catch(() => {});
      getStats().then(setStats);
      getMeditationCount().then(setMeditationCount);
    }, [])
  );

  // Animate progress bar
  useEffect(() => {
    const pct = (completed.size / 1189) * 100;
    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [completed.size]);

  async function handlePurchase() {
    setPaywallLoading(true);
    const result = await purchasePremium();
    setPaywallLoading(false);
    if (result.success) {
      setShowPaywall(false);
      setIsPro(true);
    }
  }

  // Badge calculations
  const allBadges = useMemo(() => [...BADGES, ...BOOK_BADGES], []);
  const earnedBadges = useMemo(() => {
    if (!stats) return [];
    return allBadges.filter(b => b.check(stats, completed, meditationCount));
  }, [stats, completed, meditationCount, allBadges]);

  // Recent badges: sorted by tier (highest first), take 6
  const recentBadges = useMemo(() => {
    const sorted = [...earnedBadges].sort((a, b) => {
      const tierIdx = (t: Tier) => TIER_ORDER.indexOf(t);
      return tierIdx(a.tier) - tierIdx(b.tier);
    });
    return sorted.slice(0, 6);
  }, [earnedBadges]);

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const totalDone = completed.size;
  const completionPct = Math.round((totalDone / 1189) * 100 * 10) / 10;

  // Skeleton
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerArea}>
          <View style={[styles.skeleton, { width: 100, height: 20 }]} />
          <View style={[styles.skeleton, { width: 80, height: 14, marginTop: 6 }]} />
          <View style={[styles.skeleton, { height: 6, borderRadius: 3, marginTop: 12 }]} />
        </View>
        <View style={{ padding: 20 }}>
          <View style={[styles.skeleton, { height: 200, borderRadius: 12 }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header: Progress summary ── */}
        <View style={styles.headerArea}>
          <Text style={styles.headerTitle}>나의 여정</Text>
          <View style={styles.headerStats}>
            <Text style={styles.headerCount}>{totalDone}</Text>
            <Text style={styles.headerTotal}> / 1189</Text>
          </View>
          <View style={styles.progressRow}>
            <View style={styles.progressBar}>
              <Animated.View style={[styles.progressFill, { width: progressBarWidth }]} />
            </View>
            <Text style={styles.progressPct}>{completionPct}%</Text>
          </View>
        </View>

        {/* ── 66-Book Grid ── */}
        <View style={styles.section}>
          <BookGrid completed={completed} onBookPress={setSelectedBookId} />
        </View>

        {/* ── Badges Section ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>BADGES</Text>
            <Text style={styles.sectionCount}>{earnedBadges.length} / {allBadges.length}</Text>
          </View>

          {earnedBadges.length === 0 ? (
            <View style={styles.emptyBadge}>
              <MaterialCommunityIcons name="trophy-outline" size={28} color={theme.textMuted} />
              <Text style={styles.emptyBadgeText}>첫 챕터를 읽고 첫 뱃지를 획득하세요</Text>
            </View>
          ) : (
            <>
              {/* Recent badges carousel */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.badgeCarousel}
              >
                {recentBadges.map(badge => (
                  <View
                    key={badge.id}
                    style={[styles.badgeChip, { borderColor: `${TIER_COLORS[badge.tier]}44` }]}
                  >
                    <View style={[styles.badgeChipIcon, { backgroundColor: `${TIER_COLORS[badge.tier]}15` }]}>
                      <MaterialCommunityIcons
                        name={badge.icon}
                        size={18}
                        color={TIER_COLORS[badge.tier]}
                      />
                    </View>
                    <Text style={[styles.badgeChipTitle, { color: TIER_COLORS[badge.tier] }]} numberOfLines={1}>
                      {badge.title}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              {/* Show all toggle */}
              <Pressable
                style={({ pressed }) => [styles.showAllBtn, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowAllBadges(!showAllBadges);
                }}
              >
                <Text style={styles.showAllText}>
                  {showAllBadges ? '접기' : '전체 보기'}
                </Text>
                <MaterialCommunityIcons
                  name={showAllBadges ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={theme.gold}
                />
              </Pressable>

              {/* Full badge grid (expanded) */}
              {showAllBadges && (
                <View style={styles.fullBadgeGrid}>
                  {/* Achievement badges by tier */}
                  {TIER_ORDER.slice().reverse().map(tier => {
                    const tierBadges = BADGES.filter(b => b.tier === tier);
                    if (tierBadges.length === 0) return null;
                    const tierEarned = tierBadges.filter(b =>
                      stats ? b.check(stats, completed, meditationCount) : false
                    ).length;

                    return (
                      <View key={tier} style={styles.tierSection}>
                        <View style={styles.tierHeader}>
                          <View style={[styles.tierDot, { backgroundColor: TIER_COLORS[tier] }]} />
                          <Text style={[styles.tierLabel, { color: TIER_COLORS[tier] }]}>
                            {TIER_LABELS[tier]}
                          </Text>
                          <View style={styles.tierDivider} />
                          <Text style={styles.tierCount}>{tierEarned}/{tierBadges.length}</Text>
                        </View>
                        <View style={styles.badgeRow}>
                          {tierBadges.map(badge => {
                            const earned = stats ? badge.check(stats, completed, meditationCount) : false;
                            return (
                              <View
                                key={badge.id}
                                style={[
                                  styles.badgeMiniCard,
                                  earned
                                    ? { borderColor: TIER_COLORS[badge.tier], backgroundColor: `${TIER_COLORS[badge.tier]}10` }
                                    : styles.badgeMiniCardLocked,
                                ]}
                              >
                                <MaterialCommunityIcons
                                  name={earned ? badge.icon : 'lock-outline'}
                                  size={20}
                                  color={earned ? TIER_COLORS[badge.tier] : 'rgba(255,255,255,0.15)'}
                                />
                                <Text
                                  style={[
                                    styles.badgeMiniTitle,
                                    earned ? { color: TIER_COLORS[badge.tier] } : { color: 'rgba(255,255,255,0.2)' },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {badge.title}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}

                  {/* Book badges summary */}
                  <View style={styles.tierSection}>
                    <View style={styles.tierHeader}>
                      <View style={[styles.tierDot, { backgroundColor: theme.gold }]} />
                      <Text style={[styles.tierLabel, { color: theme.gold }]}>66권 완독</Text>
                      <View style={styles.tierDivider} />
                      <Text style={styles.tierCount}>
                        {BOOK_BADGES.filter(b => stats ? b.check(stats, completed, meditationCount) : false).length}/{BOOK_BADGES.length}
                      </Text>
                    </View>
                    <Text style={styles.bookBadgeHint}>
                      위 타일 그리드에서 각 권의 진행도를 확인하세요
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Heatmap ── */}
        <View style={styles.section}>
          <Pressable
            style={styles.heatmapWrapper}
            onPress={() => isPro ? router.push('/reading-history') : setShowPaywall(true)}
          >
            <StreakHeatmap isPro={isPro} onUpgrade={() => setShowPaywall(true)} />
          </Pressable>
        </View>
      </ScrollView>

      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onPurchase={handlePurchase}
        loading={paywallLoading}
      />

      <ChapterSheet
        bookId={selectedBookId}
        completed={completed}
        onClose={() => setSelectedBookId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  scroll: { paddingBottom: 40 },

  // Skeleton
  skeleton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
  },

  // Header
  headerArea: {
    padding: 20,
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.text,
    letterSpacing: 0.3,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  headerCount: {
    fontSize: 32,
    fontWeight: '900',
    color: theme.gold,
    letterSpacing: -1,
  },
  headerTotal: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textMuted,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: theme.goldBg,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.gold,
    borderRadius: 3,
  },
  progressPct: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.gold,
    minWidth: 42,
    textAlign: 'right',
  },

  // Sections
  section: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontSize: 12,
    color: theme.textMuted,
    fontWeight: '600',
  },

  // Empty badge state
  emptyBadge: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  emptyBadgeText: {
    fontSize: 13,
    color: theme.textMuted,
  },

  // Badge carousel
  badgeCarousel: {
    gap: 8,
    paddingRight: 20,
  },
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeChipIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeChipTitle: {
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 80,
  },

  // Show all button
  showAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    marginTop: 8,
  },
  showAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.gold,
  },

  // Full badge grid
  fullBadgeGrid: {
    marginTop: 8,
    gap: 20,
  },
  tierSection: {
    gap: 8,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tierLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  tierDivider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tierCount: {
    fontSize: 11,
    color: theme.textMuted,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badgeMiniCard: {
    alignItems: 'center',
    gap: 4,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 70,
  },
  badgeMiniCardLocked: {
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  badgeMiniTitle: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  bookBadgeHint: {
    fontSize: 12,
    color: theme.textMuted,
    fontStyle: 'italic',
  },

  // Heatmap
  heatmapWrapper: {
    paddingTop: 4,
  },
});

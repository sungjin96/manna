import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme } from '../constants/theme';
import { BADGES, BOOK_BADGES, type Badge, type Tier } from '../app/(tabs)/achievements';
import { getStats, type UserStats } from '../db/stats';
import { getAllCompletedChapters } from '../db/readings';
import { getAllMeditations } from '../db/meditations';
import { getSetting, setSetting } from '../db/settings';

const TIER_COLORS: Record<Tier, string> = {
  bronze: '#CD7F32',
  silver: '#A8B0BB',
  gold: '#D4A847',
  diamond: '#7EC8E3',
};

const TIER_LABELS: Record<Tier, string> = {
  bronze: 'BRONZE',
  silver: 'SILVER',
  gold: 'GOLD',
  diamond: 'DIAMOND',
};

const TIER_ORDER: Tier[] = ['diamond', 'gold', 'silver', 'bronze'];

/** 뱃지별 진행률 계산 (0~100). check 함수가 boolean이라 수동 매핑. */
function getBadgeProgress(badge: Badge, stats: UserStats, meditationCount: number): number {
  const targets: Record<string, { current: number; goal: number }> = {
    first_step: { current: stats.totalChapters, goal: 1 },
    streak_3: { current: stats.longestStreak, goal: 3 },
    chapters_10: { current: stats.totalChapters, goal: 10 },
    meditation_1: { current: meditationCount, goal: 1 },
    streak_7: { current: stats.longestStreak, goal: 7 },
    chapters_50: { current: stats.totalChapters, goal: 50 },
    meditation_10: { current: meditationCount, goal: 10 },
    streak_21: { current: stats.longestStreak, goal: 21 },
    chapters_100: { current: stats.totalChapters, goal: 100 },
    meditation_20: { current: meditationCount, goal: 20 },
    streak_100: { current: stats.longestStreak, goal: 100 },
    bible_complete: { current: stats.totalChapters, goal: 1189 },
  };
  const t = targets[badge.id];
  if (!t) return 0;
  return Math.min(100, Math.round((t.current / t.goal) * 100));
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (badge: Badge | null) => void;
  stats: UserStats | null;
  completed: Set<string>;
  meditationCount?: number;
}

export async function getSelectedBadgeId(): Promise<string | null> {
  const val = await getSetting('selected_badge_id', '');
  return val || null;
}

export async function setSelectedBadgeId(id: string | null): Promise<void> {
  await setSetting('selected_badge_id', id ?? '');
}

const SCREEN_H = Dimensions.get('window').height;

export default function BadgeSelectSheet({ visible, onClose, onSelect, stats, completed, meditationCount: meditationCountProp }: Props) {
  const [localMeditationCount, setLocalMeditationCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sheetY = useRef(new Animated.Value(SCREEN_H)).current;

  useEffect(() => {
    if (visible) {
      sheetY.setValue(SCREEN_H);
      Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 11 }).start();
      if (meditationCountProp === undefined) {
        getAllMeditations().then(m => setLocalMeditationCount(m.length)).catch(() => {});
      }
      getSelectedBadgeId().then(setSelectedId).catch(() => {});
    }
  }, [visible, meditationCountProp]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 4,
      onPanResponderMove: (_, { dy }) => { if (dy > 0) sheetY.setValue(dy); },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 80 || vy > 0.5) {
          dismiss();
        } else {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
        }
      },
    })
  ).current;

  function dismiss() {
    Animated.timing(sheetY, { toValue: SCREEN_H, duration: 260, useNativeDriver: true }).start(() => onClose());
  }

  const meditationCount = meditationCountProp ?? localMeditationCount;

  const earnedBadges = stats
    ? [...BADGES, ...BOOK_BADGES].filter(b => b.check(stats, completed, meditationCount))
    : [];

  // 티어별 그룹
  const grouped = TIER_ORDER.map(tier => ({
    tier,
    badges: earnedBadges.filter(b => b.tier === tier),
  })).filter(g => g.badges.length > 0);

  function handleSelect(badge: Badge) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedId(badge.id);
    setSelectedBadgeId(badge.id);
    onSelect(badge);
    dismiss();
  }

  function handleAutoSelect() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedId(null);
    setSelectedBadgeId(null);
    onSelect(null);
    dismiss();
  }

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={dismiss} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
          <View {...panResponder.panHandlers}>
            <View style={styles.handleArea}>
              <View style={styles.handleBar} />
            </View>
          </View>

          <Text style={styles.title}>대표 뱃지 선택</Text>
          <Text style={styles.subtitle}>홈 화면에 표시할 뱃지를 선택하세요</Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 자동 선택 옵션 */}
            <Pressable
              style={({ pressed }) => [
                styles.badgeRow,
                selectedId === null && styles.badgeRowSelected,
                pressed && { opacity: 0.75 },
              ]}
              onPress={handleAutoSelect}
              accessibilityLabel="자동 선택 - 가장 높은 등급 뱃지"
              accessibilityRole="button"
            >
              <View style={[styles.badgeIcon, { backgroundColor: `${theme.gold}15` }]}>
                <MaterialCommunityIcons name="auto-fix" size={20} color={theme.gold} />
              </View>
              <View style={styles.badgeInfo}>
                <Text style={styles.badgeName}>자동 (최고 등급)</Text>
                <Text style={styles.badgeDesc}>가장 높은 등급의 뱃지를 자동으로 표시</Text>
              </View>
              {selectedId === null && (
                <MaterialCommunityIcons name="check-circle" size={20} color={theme.gold} />
              )}
            </Pressable>

            {grouped.map(({ tier, badges }) => (
              <View key={tier}>
                <Text style={[styles.tierLabel, { color: TIER_COLORS[tier] }]}>
                  {TIER_LABELS[tier]}
                </Text>
                {badges.map(badge => (
                  <Pressable
                    key={badge.id}
                    style={({ pressed }) => [
                      styles.badgeRow,
                      selectedId === badge.id && styles.badgeRowSelected,
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={() => handleSelect(badge)}
                    accessibilityLabel={`${badge.title}, ${TIER_LABELS[tier]} 등급`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedId === badge.id }}
                  >
                    <View style={[styles.badgeIcon, { backgroundColor: `${TIER_COLORS[tier]}15` }]}>
                      <MaterialCommunityIcons name={badge.icon} size={20} color={TIER_COLORS[tier]} />
                    </View>
                    <View style={styles.badgeInfo}>
                      <Text style={styles.badgeName}>{badge.title}</Text>
                      <Text style={styles.badgeDesc}>{badge.desc}</Text>
                    </View>
                    {selectedId === badge.id && (
                      <MaterialCommunityIcons name="check-circle" size={20} color={TIER_COLORS[tier]} />
                    )}
                  </Pressable>
                ))}
              </View>
            ))}

            {earnedBadges.length === 0 && (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="trophy-outline" size={40} color={theme.textMuted} />
                <Text style={styles.emptyText}>아직 획득한 뱃지가 없습니다</Text>
                <Text style={styles.emptyHint}>챕터를 읽고 첫 뱃지를 획득해보세요</Text>
              </View>
            )}

            {/* 미획득 뱃지 + 달성률 */}
            {stats && (() => {
              const allBadges = [...BADGES, ...BOOK_BADGES];
              const unearnedBadges = allBadges.filter(b => !b.check(stats, completed, meditationCount));
              // 업적 뱃지만 (66권 뱃지는 너무 많으므로 제외)
              const unearnedAchievements = unearnedBadges.filter(b => !b.id.startsWith('book_'));
              if (unearnedAchievements.length === 0) return null;
              return (
                <View>
                  <Text style={styles.unearnedLabel}>도전 중</Text>
                  {unearnedAchievements.map(badge => {
                    const progress = getBadgeProgress(badge, stats, meditationCount);
                    return (
                      <View key={badge.id} style={styles.unearnedRow}>
                        <View style={[styles.badgeIcon, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                          <MaterialCommunityIcons name={badge.icon} size={20} color="rgba(255,255,255,0.2)" />
                        </View>
                        <View style={styles.badgeInfo}>
                          <Text style={styles.unearnedName}>{badge.title}</Text>
                          <View style={styles.progressBarWrap}>
                            <View style={styles.progressBarTrack}>
                              <View style={[styles.progressBarFill, { width: `${progress}%` as any, backgroundColor: TIER_COLORS[badge.tier] }]} />
                            </View>
                            <Text style={[styles.progressPct, { color: TIER_COLORS[badge.tier] }]}>{progress}%</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })()}
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
    paddingHorizontal: 24,
    paddingBottom: 40,
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
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: theme.textMuted,
    marginBottom: 20,
  },
  list: {
    maxHeight: SCREEN_H * 0.5,
  },
  listContent: {
    paddingBottom: 16,
    gap: 6,
  },
  tierLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
    backgroundColor: theme.surface2,
  },
  badgeRowSelected: {
    borderWidth: 1,
    borderColor: theme.goldBorder,
    backgroundColor: `rgba(212,168,71,0.06)`,
  },
  badgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInfo: {
    flex: 1,
    gap: 2,
  },
  badgeName: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
  },
  badgeDesc: {
    fontSize: 12,
    color: theme.textMuted,
  },
  // Unearned badges
  unearnedLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: theme.textMuted,
    marginTop: 20,
    marginBottom: 10,
  },
  unearnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  unearnedName: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
  },
  progressBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  progressBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressPct: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'right',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textSub,
  },
  emptyHint: {
    fontSize: 13,
    color: theme.textMuted,
  },
});

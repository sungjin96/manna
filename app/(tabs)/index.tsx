import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useStreak } from '../../hooks/useStreak';
import { getLastReadPosition, getAllCompletedChapters } from '../../db/readings';
import { getSetting, setSetting } from '../../db/settings';
import { getActivePlan, setActivePlan, todayISO } from '../../db/reading_plans';
import { getChaptersForDay, PlanChapter, READING_PLANS, PlanId } from '../../constants/reading-plans';
import { BOOKS } from '../../constants/books';
import { theme } from '../../constants/theme';
import { scheduleReadingReminder } from '../../utils/notifications';
import WeeklyReportCard from '../../components/WeeklyReportCard';

const XP_PER_LEVEL = 1200;

function nextAfter(bookId: number, chapter: number): { bookId: number; chapter: number } {
  const book = BOOKS.find(b => b.id === bookId);
  if (!book) return { bookId: 1, chapter: 1 };
  if (chapter < book.chapters) return { bookId, chapter: chapter + 1 };
  const nextBook = BOOKS.find(b => b.id === bookId + 1);
  return nextBook ? { bookId: nextBook.id, chapter: 1 } : { bookId: 1, chapter: 1 };
}

function todayLabel(): string {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

const ONBOARDING_PAGES = [
  {
    type: 'content' as const,
    icon: 'fire' as const,
    title: '매일, 한 챕터',
    body: '하루 5분. 성경 한 챕터를 읽고\n연속 읽기 기록을 쌓아보세요.',
  },
  {
    type: 'content' as const,
    icon: 'notebook-edit-outline' as const,
    title: '묵상을 기록하세요',
    body: '오늘 읽은 말씀에서\n마음에 닿은 한 줄을 남겨보세요.',
  },
  {
    type: 'content' as const,
    icon: 'trophy-outline' as const,
    title: 'XP와 레벨업',
    body: '챕터를 읽을수록 XP를 얻고\n레벨이 올라갑니다. 성경 완독까지!',
  },
  {
    type: 'plan' as const,
    icon: 'calendar-check-outline' as const,
    title: '통독 계획',
    body: '체계적으로 읽고 싶다면 계획을 선택하세요.\n나중에 설정에서 바꿀 수 있어요.',
  },
  {
    type: 'notification' as const,
    icon: 'bell-ring-outline' as const,
    title: '매일 말씀 알림',
    body: '매일 같은 시간에 알림을 받으면\n꾸준한 읽기 습관을 만들 수 있어요.',
  },
];

// ── Book mini-map ──────────────────────────────────────────────────────────
function BookMap({ completed }: { completed: Set<string> }) {
  return (
    <View style={mapStyles.container}>
      <Text style={mapStyles.label}>66권 진행 현황</Text>
      <View style={mapStyles.grid}>
        {BOOKS.map(book => {
          let readCount = 0;
          for (let ch = 1; ch <= book.chapters; ch++) {
            if (completed.has(`${book.id}:${ch}`)) readCount++;
          }
          const isDone = readCount === book.chapters;
          const isPartial = readCount > 0 && !isDone;
          return (
            <View
              key={book.id}
              style={[
                mapStyles.sq,
                isDone && mapStyles.sqDone,
                isPartial && mapStyles.sqPartial,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const mapStyles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 10,
    color: theme.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  sq: {
    width: 13,
    height: 13,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  sqDone: {
    backgroundColor: theme.gold,
    borderColor: theme.gold,
  },
  sqPartial: {
    backgroundColor: 'rgba(212,168,71,0.35)',
    borderColor: 'rgba(212,168,71,0.25)',
  },
});

// ── Home screen ────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const { stats, loading, refresh } = useStreak();
  const [nextChapter, setNextChapter] = useState<{ bookId: number; chapter: number }>({ bookId: 1, chapter: 1 });
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingPage, setOnboardingPage] = useState(0);
  const [onboardingPlan, setOnboardingPlan] = useState<PlanId | null>(null);
  const [todayPlanChapters, setTodayPlanChapters] = useState<PlanChapter[]>([]);
  const [activePlanName, setActivePlanName] = useState<string | null>(null);

  // Animated values
  const xpAnim = useRef(new Animated.Value(0)).current;
  const streakScale = useRef(new Animated.Value(0.7)).current;
  const streakOpacity = useRef(new Animated.Value(0)).current;
  const flamePulse = useRef(new Animated.Value(1)).current;
  const mapOpacity = useRef(new Animated.Value(0)).current;
  useFocusEffect(
    useCallback(() => {
      refresh();
      Promise.all([
        getLastReadPosition(),
        getAllCompletedChapters(),
        getActivePlan(),
      ]).then(([pos, comp, plan]) => {
        setNextChapter(pos ? nextAfter(pos.bookId, pos.chapter) : { bookId: 1, chapter: 1 });
        setCompleted(comp);
        if (plan?.planId && plan?.startDate) {
          const chapters = getChaptersForDay(plan.planId as PlanId, plan.startDate);
          setTodayPlanChapters(chapters.filter(ch => !comp.has(`${ch.bookId}:${ch.chapter}`)));
          const planDef = READING_PLANS.find(p => p.id === plan.planId);
          setActivePlanName(planDef?.name ?? null);
        } else {
          setTodayPlanChapters([]);
          setActivePlanName(null);
        }
      });
    }, [refresh])
  );

  // Animate streak hero on mount
  useEffect(() => {
    Animated.parallel([
      Animated.spring(streakScale, {
        toValue: 1,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(streakOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Flame pulse loop (only when streak > 0)
    if (stats.currentStreak > 0) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(flamePulse, { toValue: 1.12, duration: 800, useNativeDriver: true }),
          Animated.timing(flamePulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [stats.currentStreak]);

  // Animate XP bar and map whenever stats change
  useEffect(() => {
    const xp = stats.totalChapters * 45;
    const xpInLevel = xp % XP_PER_LEVEL;
    const targetPct = Math.round((xpInLevel / XP_PER_LEVEL) * 100);

    Animated.parallel([
      Animated.timing(xpAnim, {
        toValue: targetPct,
        duration: 800,
        useNativeDriver: false, // width animation can't use native driver
      }),
      Animated.timing(mapOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [stats.totalChapters]);

  useEffect(() => {
    getSetting('onboarding_complete', '0').then(val => {
      if (val === '0') setShowOnboarding(true);
    });
  }, []);

  async function completeOnboarding() {
    if (onboardingPlan) {
      await setActivePlan(onboardingPlan, todayISO());
      const planDef = READING_PLANS.find(p => p.id === onboardingPlan);
      setActivePlanName(planDef?.name ?? null);
      const chapters = getChaptersForDay(onboardingPlan, todayISO());
      setTodayPlanChapters(chapters.filter(ch => !completed.has(`${ch.bookId}:${ch.chapter}`)));
    }
    await setSetting('onboarding_complete', '1');
    setShowOnboarding(false);
  }

  function nextPage() {
    if (onboardingPage < ONBOARDING_PAGES.length - 1) {
      setOnboardingPage(p => p + 1);
    } else {
      completeOnboarding();
    }
  }

  async function requestNotificationAndComplete() {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        await setSetting('notification_enabled', '1');
        await scheduleReadingReminder(8, 0);
      }
    } catch {
      // permission denied or error — continue silently
    }
    completeOnboarding();
  }

  const { bookId, chapter } = nextChapter;
  const book = BOOKS.find(b => b.id === bookId);

  function streakSubtitle(): string {
    if (stats.currentStreak === 0) return '오늘부터 시작해보세요';
    if (stats.currentStreak === 1) return '첫 번째 날! 내일도 만나요';
    if (stats.currentStreak < 7) return `${stats.currentStreak}일 연속 중이에요`;
    if (stats.currentStreak < 30) return `대단해요. ${stats.currentStreak}일 연속 읽고 있어요`;
    return `${stats.currentStreak}일. 놀랍습니다.`;
  }

  const xp = stats.totalChapters * 45;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpInLevel = xp % XP_PER_LEVEL;
  const levelTitles = ['', '구도자', '순례자', '제자', '선지자', '사도', '장로'];
  const levelTitle = levelTitles[Math.min(level, levelTitles.length - 1)];

  const page = ONBOARDING_PAGES[onboardingPage];
  const isLastPage = onboardingPage === ONBOARDING_PAGES.length - 1;

  const xpBarWidth = xpAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  if (loading) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.wordmark}>MANNA</Text>
          <Text style={styles.dateLabel}>{todayLabel()}</Text>
        </View>

        {/* Streak hero */}
        <Animated.View style={[styles.streakSection, { opacity: streakOpacity, transform: [{ scale: streakScale }] }]}>
          <Animated.View style={{ transform: [{ scale: flamePulse }] }}>
            <MaterialCommunityIcons name="fire" size={56} color={theme.gold} />
          </Animated.View>
          <Text style={styles.streakCount}>{stats.currentStreak}</Text>
          <Text style={styles.streakLabel}>일 연속 읽기</Text>
          <Text style={styles.streakSub}>{streakSubtitle()}</Text>
        </Animated.View>

        {/* XP bar */}
        <View style={styles.xpSection}>
          <View style={styles.xpMeta}>
            <Text style={styles.xpLevel}>Lv.{level} {levelTitle}</Text>
            <Text style={styles.xpValue}>{xpInLevel} / {XP_PER_LEVEL} XP</Text>
          </View>
          <View style={styles.xpBar}>
            <Animated.View style={[styles.xpFill, { width: xpBarWidth }]} />
            <Animated.View style={[styles.xpDot, { left: xpBarWidth }]} />
          </View>
        </View>

        {/* Inline stat line */}
        <View style={styles.statLine}>
          <MaterialCommunityIcons name="book-open-variant" size={13} color={theme.textMuted} />
          <Text style={styles.statLineText}>
            {stats.totalChapters}챕터 읽음
          </Text>
          <Text style={styles.statLineDot}>·</Text>
          <Text style={styles.statLineText}>
            전체의 {Math.round((stats.totalChapters / 1189) * 100)}%
          </Text>
          {stats.longestStreak > 0 && (
            <>
              <Text style={styles.statLineDot}>·</Text>
              <MaterialCommunityIcons name="trophy-outline" size={13} color={theme.textMuted} />
              <Text style={styles.statLineText}>최장 {stats.longestStreak}일</Text>
            </>
          )}
        </View>

        {/* 주간 리포트 카드 */}
        <View style={styles.weeklyReportWrapper}>
          <WeeklyReportCard />
        </View>

        {/* 66-book mini-map */}
        <Animated.View style={{ opacity: mapOpacity }}>
          <BookMap completed={completed} />
        </Animated.View>

        {/* 오늘의 계획 */}
        {activePlanName !== null && (
          <View style={styles.planSection}>
            <Text style={styles.planSectionLabel}>{activePlanName} — 오늘의 계획</Text>
            {todayPlanChapters.length > 0 ? (
              <View style={styles.planChapters}>
                {todayPlanChapters.map((ch, i) => {
                  const b = BOOKS.find(bb => bb.id === ch.bookId);
                  return (
                    <Pressable
                      key={i}
                      style={({ pressed }) => [styles.planChip, pressed && styles.planChipPressed]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(`/read/${ch.bookId}/${ch.chapter}`);
                      }}
                    >
                      <Text style={styles.planChipText}>{b?.name} {ch.chapter}장</Text>
                      <MaterialCommunityIcons name="chevron-right" size={14} color={theme.gold} />
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.planDoneRow}>
                <MaterialCommunityIcons name="check-circle" size={16} color={theme.gold} />
                <Text style={styles.planDoneText}>오늘 계획을 모두 완료했습니다!</Text>
              </View>
            )}
          </View>
        )}

        {/* Empty state — first-time user */}
        {stats.totalChapters === 0 && !showOnboarding && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>오늘 창세기 1장부터 시작해볼까요?</Text>
            <Text style={styles.emptyBody}>매일 한 챕터씩 읽으면 3년 안에 성경 전체를 완독할 수 있어요.</Text>
          </View>
        )}

        {/* CTA */}
        <Pressable
          style={({ pressed }) => [styles.readBtn, pressed && styles.readBtnPressed]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push(`/read/${bookId}/${chapter}`);
          }}
        >
          <View style={styles.readBtnLeft}>
            <Text style={styles.readBtnEyebrow}>오늘 읽기</Text>
            <Text style={styles.readBtnTitle}>{book?.name} {chapter}장</Text>
            <Text style={styles.readBtnSub}>
              {book?.testament === 'old' ? '구약' : '신약'} · 약 5분
            </Text>
          </View>
          <View style={styles.readBtnArrow}>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.bg} />
          </View>
        </Pressable>
      </ScrollView>

      {/* Onboarding modal */}
      <Modal visible={showOnboarding} transparent animationType="fade">
        <View style={styles.onboardingOverlay}>
          <View style={styles.onboardingCard}>
            <MaterialCommunityIcons name={page.icon} size={72} color={theme.gold} />
            <Text style={styles.onboardingTitle}>{page.title}</Text>
            <Text style={styles.onboardingBody}>{page.body}</Text>

            {/* Plan selection page */}
            {page.type === 'plan' && (
              <ScrollView
                style={styles.onboardingPlanList}
                contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                <Pressable
                  style={[styles.onboardingPlanChip, onboardingPlan === null && styles.onboardingPlanChipSelected]}
                  onPress={() => setOnboardingPlan(null)}
                >
                  <Text style={[styles.onboardingPlanChipText, onboardingPlan === null && styles.onboardingPlanChipTextSelected]}>
                    없음 (자유롭게 읽기)
                  </Text>
                  {onboardingPlan === null && <MaterialCommunityIcons name="check" size={14} color={theme.bg} />}
                </Pressable>
                {READING_PLANS.map(plan => (
                  <Pressable
                    key={plan.id}
                    style={[styles.onboardingPlanChip, onboardingPlan === plan.id && styles.onboardingPlanChipSelected]}
                    onPress={() => setOnboardingPlan(plan.id as PlanId)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.onboardingPlanChipText, onboardingPlan === plan.id && styles.onboardingPlanChipTextSelected]}>
                        {plan.name}
                      </Text>
                      <Text style={styles.onboardingPlanChipHint}>{plan.description}</Text>
                    </View>
                    {onboardingPlan === plan.id && <MaterialCommunityIcons name="check" size={14} color={theme.bg} />}
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={styles.dots}>
              {ONBOARDING_PAGES.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === onboardingPage && styles.dotActive]}
                />
              ))}
            </View>

            {page.type === 'notification' ? (
              <View style={styles.onboardingNotifBtns}>
                <Pressable
                  style={({ pressed }) => [styles.onboardingBtn, pressed && styles.onboardingBtnPressed]}
                  onPress={requestNotificationAndComplete}
                >
                  <Text style={styles.onboardingBtnText}>알림 켜기</Text>
                </Pressable>
                <Pressable onPress={completeOnboarding} hitSlop={8}>
                  <Text style={styles.onboardingSkipText}>나중에 설정에서 켤게요</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.onboardingBtn, pressed && styles.onboardingBtnPressed]}
                onPress={nextPage}
              >
                <Text style={styles.onboardingBtnText}>
                  {isLastPage ? '시작하기' : '다음'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  scroll: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 32,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  wordmark: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 5,
    color: theme.gold,
  },
  dateLabel: {
    fontSize: 11,
    color: theme.textMuted,
  },

  streakSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  streakCount: {
    fontSize: 80,
    fontWeight: '900',
    color: theme.gold,
    lineHeight: 88,
    letterSpacing: -4,
  },
  streakLabel: {
    fontSize: 15,
    color: theme.textSub,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  streakSub: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 6,
    letterSpacing: 0.2,
  },

  xpSection: {
    marginBottom: 20,
    gap: 8,
  },
  xpMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xpLevel: {
    fontSize: 11,
    color: theme.gold,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  xpValue: {
    fontSize: 11,
    color: theme.textMuted,
  },
  xpBar: {
    height: 6,
    backgroundColor: theme.goldBg,
    borderRadius: 3,
    overflow: 'visible',
    borderWidth: 1,
    borderColor: theme.goldBorder,
    position: 'relative',
  },
  xpFill: {
    height: '100%',
    backgroundColor: theme.gold,
    borderRadius: 3,
    shadowColor: theme.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
  },
  xpDot: {
    position: 'absolute',
    top: -3,
    marginLeft: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.gold,
    borderWidth: 2,
    borderColor: theme.bg,
    shadowColor: theme.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },

  weeklyReportWrapper: {
    marginHorizontal: 4,
    marginBottom: 20,
  },
  statLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  statLineText: {
    fontSize: 12,
    color: theme.textMuted,
  },
  statLineDot: {
    fontSize: 12,
    color: theme.borderSubtle,
    marginHorizontal: 2,
  },

  planSection: {
    marginBottom: 20,
    gap: 10,
  },
  planSectionLabel: {
    fontSize: 10,
    color: theme.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  planChapters: {
    gap: 8,
  },
  planChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.goldBorder,
  },
  planChipPressed: {
    backgroundColor: theme.surface2,
  },
  planChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
  },
  planDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  planDoneText: {
    fontSize: 14,
    color: theme.gold,
    fontWeight: '600',
  },

  readBtn: {
    backgroundColor: theme.gold,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: theme.gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  readBtnPressed: {
    backgroundColor: theme.goldDark,
  },
  readBtnLeft: {
    flex: 1,
  },
  readBtnEyebrow: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    color: 'rgba(11,10,18,0.6)',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  readBtnTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.bg,
    letterSpacing: -0.3,
  },
  readBtnSub: {
    fontSize: 11,
    color: 'rgba(11,10,18,0.5)',
    marginTop: 3,
    letterSpacing: 0.2,
  },
  readBtnArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(11,10,18,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  emptyCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.goldBorder,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.gold,
  },
  emptyBody: {
    fontSize: 13,
    color: theme.textSub,
    lineHeight: 20,
  },

  // Onboarding
  onboardingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  onboardingCard: {
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: theme.goldBorder,
    gap: 16,
  },
  onboardingTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.text,
    textAlign: 'center',
  },
  onboardingBody: {
    fontSize: 15,
    color: theme.textSub,
    textAlign: 'center',
    lineHeight: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.borderSubtle,
  },
  dotActive: {
    backgroundColor: theme.gold,
    width: 20,
  },
  onboardingBtn: {
    backgroundColor: theme.gold,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
  },
  onboardingBtnPressed: { backgroundColor: theme.goldDark },
  onboardingBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.bg,
    letterSpacing: 0.3,
  },
  onboardingNotifBtns: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  onboardingSkipText: {
    fontSize: 13,
    color: theme.textMuted,
  },
  onboardingPlanList: {
    width: '100%',
    maxHeight: 200,
  },
  onboardingPlanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.goldBorder,
    backgroundColor: theme.surface2,
    gap: 8,
  },
  onboardingPlanChipSelected: {
    backgroundColor: theme.gold,
    borderColor: theme.gold,
  },
  onboardingPlanChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.text,
    flex: 1,
  },
  onboardingPlanChipTextSelected: {
    color: theme.bg,
  },
  onboardingPlanChipHint: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 1,
  },
});

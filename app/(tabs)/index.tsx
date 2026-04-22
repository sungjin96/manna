import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useStreak } from '../../hooks/useStreak';
import { getLastReadPosition, getAllCompletedChapters } from '../../db/readings';
import { getSetting, setSetting, getLastOpenedPosition } from '../../db/settings';
import { getTodayRecommendation, getRandomChapter } from '../../constants/discovery';
import { getActivePlan, setActivePlan, todayISO } from '../../db/reading_plans';
import { getChaptersForDay, PlanChapter, READING_PLANS, PlanId } from '../../constants/reading-plans';
import { BOOKS } from '../../constants/books';
import { theme } from '../../constants/theme';
import { requestNotificationPermission, scheduleReadingReminder, scheduleVerseNotifications } from '../../utils/notifications';
import { BADGES, BOOK_BADGES, type Badge, type Tier } from './achievements';
import { getAllMeditations } from '../../db/meditations';
import { getDailyEntry, type DailyEntry } from '../../utils/daily-meditation';
import ProgressRing from '../../components/ProgressRing';
import BadgeSelectSheet, { getSelectedBadgeId } from '../../components/BadgeSelectSheet';
import { useUIScale } from '../../contexts/UIScaleContext';

const XP_PER_LEVEL = 1200;

// ── Helpers ───────────────────────────────────────────────────────────

function nextAfter(bookId: number, chapter: number): { bookId: number; chapter: number } {
  const book = BOOKS.find(b => b.id === bookId);
  if (!book) return { bookId: 1, chapter: 1 };
  if (chapter < book.chapters) return { bookId, chapter: chapter + 1 };
  const nextBook = BOOKS.find(b => b.id === bookId + 1);
  return nextBook ? { bookId: nextBook.id, chapter: 1 } : { bookId: 1, chapter: 1 };
}

function greetingText(): string {
  const h = new Date().getHours();
  if (h < 6) return '새벽을 깨우며';
  if (h < 12) return '좋은 아침';
  if (h < 18) return '좋은 오후';
  if (h < 22) return '오늘 하루 마무리';
  return '늦은 밤에도';
}

function todayLabel(): string {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

const TIER_ORDER: Tier[] = ['diamond', 'gold', 'silver', 'bronze'];

function getTopBadge(
  earnedBadges: Badge[],
  selectedId: string | null,
): Badge | null {
  if (earnedBadges.length === 0) return null;
  if (selectedId) {
    const found = earnedBadges.find(b => b.id === selectedId);
    if (found) return found;
  }
  // 자동: 최고 티어 중 첫 번째
  for (const tier of TIER_ORDER) {
    const match = earnedBadges.find(b => b.tier === tier);
    if (match) return match;
  }
  return earnedBadges[0];
}

// ── Onboarding ────────────────────────────────────────────────────────

const ONBOARDING_PAGES = [
  {
    type: 'content' as const,
    icon: 'fire' as const,
    title: '매일, 한 챕터',
    body: '하루 5분. 성경 한 챕터를 읽고\n연속 읽기 기록을 쌓아보세요.',
  },
  {
    type: 'explore' as const,
    icon: 'compass-outline' as const,
    title: '오늘 뭘 읽을까요?',
    body: '탐색 섹션에서 원하는 방식으로\n말씀을 펼쳐보세요.',
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
    title: '읽기 알림',
    body: '매일 같은 시간에 알림을 받으면\n꾸준한 읽기 습관을 만들 수 있어요.',
  },
  {
    type: 'verse_notification' as const,
    icon: 'book-open-variant' as const,
    title: '말씀 알림',
    body: '하루 중 말씀 한 구절을 보내드려요.\n탭하면 바로 묵상 기록을 남길 수 있어요.',
  },
];

// ── Weekly dots ───────────────────────────────────────────────────────

function getWeekDays(): { label: string; dateStr: string; isToday: boolean }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const todayStr = fmt(today);
  const labels = ['월', '화', '수', '목', '금', '토', '일'];
  return labels.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { label, dateStr: fmt(d), isToday: fmt(d) === todayStr };
  });
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Home screen ──────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const { scale, fs, is } = useUIScale();
  const styles = useMemo(() => makeStyles(scale), [scale]);
  const { stats, loading, refresh } = useStreak();

  // Data state
  const [nextChapter, setNextChapter] = useState<{ bookId: number; chapter: number }>({ bookId: 1, chapter: 1 });
  const [lastOpenedChapter, setLastOpenedChapter] = useState<{ bookId: number; chapter: number } | null | undefined>(undefined);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [todayRecommendation, setTodayRecommendation] = useState<{ bookId: number; chapter: number } | null>(null);
  const [dailyEntry, setDailyEntry] = useState<DailyEntry | null>(null);
  const [todayPlanChapters, setTodayPlanChapters] = useState<PlanChapter[]>([]);
  const [activePlanName, setActivePlanName] = useState<string | null>(null);
  const [weeklyData, setWeeklyData] = useState<Map<string, number>>(new Map());
  const [dataReady, setDataReady] = useState(false);

  // Badge state
  const [meditationCount, setMeditationCount] = useState(0);
  const [selectedBadgeId, setSelectedBadgeIdState] = useState<string | null>(null);
  const [showBadgeSheet, setShowBadgeSheet] = useState(false);

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingPage, setOnboardingPage] = useState(0);
  const [onboardingPlan, setOnboardingPlan] = useState<PlanId | null>(null);
  const [onboardingVerseHour, setOnboardingVerseHour] = useState(21);
  const [onboardingVerseMinute, setOnboardingVerseMinute] = useState(0);
  const onboardingSlide = useRef(new Animated.Value(0)).current;

  // Level-up detection
  const [showLevelUp, setShowLevelUp] = useState(false);
  const prevLevelRef = useRef<number | null>(null);
  const hasInitialLoadRef = useRef(false);

  // Animations
  const xpAnim = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const streakScale = useRef(new Animated.Value(0.8)).current;
  const levelUpGlow = useRef(new Animated.Value(0)).current;
  const fabBounce = useRef(new Animated.Value(0)).current;
  const fabScale = useRef(new Animated.Value(1)).current;

  // Flip card
  const [heroFlipped, setHeroFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const heroFlippedRef = useRef(false);

  function flipHero() {
    const toValue = heroFlippedRef.current ? 0 : 1;
    heroFlippedRef.current = !heroFlippedRef.current;
    Animated.spring(flipAnim, {
      toValue,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start();
    setHeroFlipped(heroFlippedRef.current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const flipPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderRelease: (_, gs) => {
        if (Math.abs(gs.dx) > 40) flipHero();
      },
    })
  ).current;

  // ── Data loading ──

  useFocusEffect(
    useCallback(() => {
      refresh();
      Promise.all([
        getLastReadPosition(),
        getAllCompletedChapters(),
        getActivePlan(),
        getLastOpenedPosition(),
        getAllMeditations(),
        getSelectedBadgeId(),
        import('../../db/readings').then(m => m.getWeeklyReadings()),
      ]).then(([pos, comp, plan, lastOpened, meditations, badgeId, weekly]) => {
        // 이어읽기 로직
        if (lastOpened) {
          setNextChapter(lastOpened);
          setLastOpenedChapter(lastOpened);
        } else if (pos) {
          setNextChapter(nextAfter(pos.bookId, pos.chapter));
          setLastOpenedChapter(null);
        } else {
          setNextChapter({ bookId: 1, chapter: 1 });
          setLastOpenedChapter(null);
        }

        setCompleted(comp);
        setTodayRecommendation(getTodayRecommendation(comp));
        setMeditationCount(meditations.length);
        setDailyEntry(getDailyEntry());
        setSelectedBadgeIdState(badgeId);
        setWeeklyData(weekly);

        if (plan?.planId && plan?.startDate) {
          const chapters = getChaptersForDay(plan.planId as PlanId, plan.startDate);
          setTodayPlanChapters(chapters.filter(ch => !comp.has(`${ch.bookId}:${ch.chapter}`)));
          const planDef = READING_PLANS.find(p => p.id === plan.planId);
          setActivePlanName(planDef?.name ?? null);
        } else {
          setTodayPlanChapters([]);
          setActivePlanName(null);
        }

        setDataReady(true);
      }).catch(() => {
        setLastOpenedChapter(null);
        setDataReady(true);
      });
    }, [refresh])
  );

  // ── Animations ──

  useEffect(() => {
    if (dataReady) {
      Animated.parallel([
        Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(streakScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      ]).start();
    }
  }, [dataReady]);

  // FAB idle bounce
  useFocusEffect(
    useCallback(() => {
      const bounce = Animated.loop(
        Animated.sequence([
          Animated.delay(3000),
          Animated.timing(fabBounce, { toValue: -7, duration: 150, useNativeDriver: true }),
          Animated.timing(fabBounce, { toValue: 2, duration: 100, useNativeDriver: true }),
          Animated.timing(fabBounce, { toValue: -3, duration: 80, useNativeDriver: true }),
          Animated.timing(fabBounce, { toValue: 0, duration: 80, useNativeDriver: true }),
        ])
      );
      bounce.start();
      return () => { bounce.stop(); fabBounce.setValue(0); };
    }, [fabBounce])
  );

  useEffect(() => {
    if (!stats) return;
    const xp = stats.totalChapters * 45;
    const currentLevel = Math.floor(xp / XP_PER_LEVEL) + 1;
    const xpInLevel = xp % XP_PER_LEVEL;
    const targetPct = Math.round((xpInLevel / XP_PER_LEVEL) * 100);

    Animated.timing(xpAnim, {
      toValue: targetPct,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // 레벨업 감지 — 초기 로드 시 오발사 방지
    if (hasInitialLoadRef.current && prevLevelRef.current !== null && currentLevel > prevLevelRef.current) {
      setShowLevelUp(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.sequence([
        Animated.timing(levelUpGlow, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(1200),
        Animated.timing(levelUpGlow, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => setShowLevelUp(false));
    }
    if (!hasInitialLoadRef.current && !loading) {
      hasInitialLoadRef.current = true;
    }
    prevLevelRef.current = currentLevel;
  }, [stats?.totalChapters, loading]);

  // ── Onboarding ──

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

  function goToOnboardingPage(next: number) {
    const dir = next > onboardingPage ? 1 : -1;
    onboardingSlide.setValue(dir * SCREEN_WIDTH);
    setOnboardingPage(next);
    Animated.spring(onboardingSlide, {
      toValue: 0,
      damping: 22,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }

  function nextOnboardingPage() {
    if (onboardingPage < ONBOARDING_PAGES.length - 1) {
      goToOnboardingPage(onboardingPage + 1);
    } else {
      completeOnboarding();
    }
  }

  async function requestReadingNotifAndNext() {
    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        await setSetting('notification_enabled', '1');
        await scheduleReadingReminder(8, 0);
      }
    } catch {}
    nextOnboardingPage();
  }

  async function requestVerseNotifAndComplete() {
    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        await setSetting('verse_notif_enabled', '1');
        const timeStr = `${String(onboardingVerseHour).padStart(2, '0')}:${String(onboardingVerseMinute).padStart(2, '0')}`;
        await setSetting('verse_notif_times', JSON.stringify([timeStr]));
        await scheduleVerseNotifications([timeStr]);
      }
    } catch {}
    completeOnboarding();
  }


  // ── Derived values ──

  const xp = (stats?.totalChapters ?? 0) * 45;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpInLevel = xp % XP_PER_LEVEL;
  const levelTitles = ['', '구도자', '순례자', '제자', '선지자', '사도', '장로'];
  const levelTitle = levelTitles[Math.min(level, levelTitles.length - 1)];
  const completionPct = Math.round(((stats?.totalChapters ?? 0) / 1189) * 100);

  const earnedBadges = stats
    ? [...BADGES, ...BOOK_BADGES].filter(b => b.check(stats, completed, meditationCount))
    : [];
  const topBadge = getTopBadge(earnedBadges, selectedBadgeId);

  // 미션 카드 우선순위: 계획 > 이어읽기 > 추천
  const missionInfo = (() => {
    if (activePlanName && todayPlanChapters.length > 0) {
      const ch = todayPlanChapters[0];
      const b = BOOKS.find(bb => bb.id === ch.bookId);
      return {
        title: `${b?.name} ${ch.chapter}장`,
        subtitle: `${activePlanName} · 남은 ${todayPlanChapters.length}챕터`,
        route: `/read/${ch.bookId}/${ch.chapter}` as const,
        type: 'plan' as const,
      };
    }
    if (activePlanName && todayPlanChapters.length === 0) {
      // 오늘 계획 완료
      const { bookId, chapter } = nextChapter;
      const b = BOOKS.find(bb => bb.id === bookId);
      return {
        title: '오늘 미션 완료',
        subtitle: b ? `${b.name} ${chapter}장 이어읽기` : '자유 읽기',
        route: `/read/${bookId}/${chapter}` as const,
        type: 'done' as const,
      };
    }
    // 이어읽기
    const { bookId, chapter } = nextChapter;
    const b = BOOKS.find(bb => bb.id === bookId);
    if (lastOpenedChapter) {
      return {
        title: `${b?.name} ${chapter}장`,
        subtitle: '이어읽기',
        route: `/read/${bookId}/${chapter}` as const,
        type: 'continue' as const,
      };
    }
    // 추천
    if (todayRecommendation) {
      const rb = BOOKS.find(bb => bb.id === todayRecommendation.bookId);
      return {
        title: `${rb?.name} ${todayRecommendation.chapter}장`,
        subtitle: '오늘의 추천',
        route: `/read/${todayRecommendation.bookId}/${todayRecommendation.chapter}` as const,
        type: 'recommend' as const,
      };
    }
    return {
      title: `${b?.name ?? '창세기'} ${chapter}장`,
      subtitle: '오늘 읽기',
      route: `/read/${bookId}/${chapter}` as const,
      type: 'default' as const,
    };
  })();

  const xpBarWidth = xpAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  const frontRotateY = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backRotateY = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-180deg', '0deg'],
  });

  const weekDays = getWeekDays();

  const page = ONBOARDING_PAGES[onboardingPage];
  const isLastPage = onboardingPage === ONBOARDING_PAGES.length - 1;

  // ── Skeleton loading ──

  if (loading || !dataReady) {
    return (
      <View style={styles.container}>
        <View style={styles.scroll}>
          {/* Header skeleton */}
          <View style={styles.header}>
            <View style={[styles.skeleton, { width: 60, height: 14 }]} />
            <View style={[styles.skeleton, { width: 32, height: 32, borderRadius: 8 }]} />
          </View>
          {/* Greeting skeleton */}
          <View style={[styles.skeleton, { width: 160, height: 14, marginBottom: 24 }]} />
          {/* Hero flip card skeleton */}
          <View style={{ alignItems: 'center', gap: 8, marginBottom: 28 }}>
            <View style={[styles.skeleton, { width: 44, height: 44, borderRadius: 22 }]} />
            <View style={[styles.skeleton, { width: 80, height: 72, borderRadius: 8 }]} />
            <View style={[styles.skeleton, { width: 120, height: 16, borderRadius: 4 }]} />
            <View style={[styles.skeleton, { width: 160, height: 4, borderRadius: 2, marginTop: 8 }]} />
          </View>
          {/* Mission skeleton */}
          <View style={[styles.skeleton, { height: 72, borderRadius: 16 }]} />
        </View>
      </View>
    );
  }

  // ── Render ──

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={{ opacity: fadeIn }}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.wordmark}>MANNA</Text>
          <Pressable
            onPress={() => router.push('/(tabs)/search')}
            hitSlop={16}
            style={styles.searchBtn}
            accessibilityLabel="검색"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="magnify" size={26} color={theme.textMuted} />
          </Pressable>
        </View>

        {/* ── Greeting ── */}
        <Text style={styles.greeting}>
          {todayLabel()} · {greetingText()}
        </Text>

        {/* ── Hero Flip Card ── */}
        <View style={styles.flipCardContainer} {...flipPanResponder.panHandlers}>
          {/* ── Front: Streak ── */}
          <Animated.View
            style={[
              styles.flipFace,
              { transform: [{ perspective: 1200 }, { rotateY: frontRotateY }] },
            ]}
            pointerEvents={heroFlipped ? 'none' : 'auto'}
          >
            {showLevelUp && (
              <Animated.View
                style={[styles.levelUpOverlay, { opacity: levelUpGlow }]}
                pointerEvents="none"
              >
                <Text style={styles.levelUpText}>LEVEL UP</Text>
              </Animated.View>
            )}
            <Animated.View style={{ transform: [{ scale: streakScale }] }}>
              <MaterialCommunityIcons name="fire" size={44} color={theme.gold} />
            </Animated.View>
            <Text style={styles.streakBigNumber}>{stats?.currentStreak ?? 0}</Text>
            <Text style={styles.streakBigLabel}>일 연속 읽기</Text>
            <Text style={styles.streakSubtext}>
              {(stats?.currentStreak ?? 0) === 0 ? '오늘부터 시작해보세요' : '내일도 이어가세요'}
            </Text>
            <View style={styles.xpInlineSection}>
              <View style={styles.xpInlineMeta}>
                <Text style={styles.xpInlineLabel}>Lv.{level} {levelTitle}</Text>
                <Text style={styles.xpInlineLabel}>{xpInLevel} / {XP_PER_LEVEL} XP</Text>
              </View>
              <View style={styles.xpBar}>
                <Animated.View style={[styles.xpFill, { width: xpBarWidth }]} />
              </View>
            </View>
            <Text style={styles.flipHint}>← 스와이프</Text>
          </Animated.View>

          {/* ── Back: Progress Ring + Stats ── */}
          <Animated.View
            style={[
              styles.flipFace,
              styles.flipBack,
              { transform: [{ perspective: 1200 }, { rotateY: backRotateY }] },
            ]}
            pointerEvents={heroFlipped ? 'auto' : 'none'}
          >
            <ProgressRing
              percentage={completionPct}
              size={Math.min(140, SCREEN_HEIGHT * 0.18)}
              strokeWidth={12}
              badge={topBadge ? { icon: topBadge.icon, tier: topBadge.tier, title: topBadge.title } : null}
              onPress={() => setShowBadgeSheet(true)}
            />
            <View style={{ height: 12 }} />
            <Text style={styles.streakBigLabel}>{Math.round(completionPct)}% 완독</Text>
            <View style={{ height: 4 }} />
            <Text style={styles.streakSubtext}>
              {stats?.totalChapters ?? 0}챕터 · 뱃지 {earnedBadges.length}개
            </Text>
            <Text style={styles.flipHint}>→ 스와이프</Text>
          </Animated.View>
        </View>

        {/* ── Today's Plan / Quick Stats ── */}
        {activePlanName && todayPlanChapters.length > 0 ? (
          <View style={styles.todayPlan}>
            <Text style={styles.sectionLabel}>{activePlanName}</Text>
            {todayPlanChapters.map((ch, i) => {
              const b = BOOKS.find(bb => bb.id === ch.bookId);
              return (
                <Pressable
                  key={i}
                  style={({ pressed }) => [styles.planItem, pressed && { opacity: 0.7 }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/read/${ch.bookId}/${ch.chapter}`);
                  }}
                >
                  <MaterialCommunityIcons name="book-open-variant" size={16} color={theme.textSub} />
                  <Text style={styles.planItemText}>{b?.name} {ch.chapter}장</Text>
                  <MaterialCommunityIcons name="chevron-right" size={14} color={theme.textMuted} />
                </Pressable>
              );
            })}
          </View>
        ) : activePlanName && todayPlanChapters.length === 0 ? (
          <View style={styles.todayPlan}>
            <Text style={styles.sectionLabel}>{activePlanName}</Text>
            <View style={styles.planDoneRow}>
              <MaterialCommunityIcons name="check-circle" size={16} color={theme.gold} />
              <Text style={styles.planDoneText}>오늘 계획을 모두 완료했습니다</Text>
            </View>
          </View>
        ) : null}

        {/* Quick stats row */}
        <View style={styles.quickStats}>
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatValue}>{stats?.totalChapters ?? 0}</Text>
            <Text style={styles.quickStatLabel}>챕터</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatValue}>{earnedBadges.length}</Text>
            <Text style={styles.quickStatLabel}>뱃지</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatValue}>{Math.round(completionPct)}%</Text>
            <Text style={styles.quickStatLabel}>완독률</Text>
          </View>
        </View>

        {/* ── Weekly Dots ── */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>이번 주</Text>
        <View style={styles.weekRow}>
          {weekDays.map(day => {
            const count = weeklyData.get(day.dateStr) ?? 0;
            return (
              <View key={day.dateStr} style={styles.weekDayCol} accessibilityLabel={`${day.label} ${count > 0 ? '읽음' : '안읽음'}`}>
                <View
                  style={[
                    styles.weekDot,
                    count > 0 && styles.weekDotActive,
                    day.isToday && styles.weekDotToday,
                  ]}
                />
                <Text style={[
                  styles.weekDayLabel,
                  day.isToday && { color: theme.gold },
                ]}>
                  {day.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ── Explore Pills ── */}
        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>EXPLORE</Text>
        <View style={styles.pillRow}>
          <Pressable
            style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
            onPress={() => router.push('/recommend-verses')}
            accessibilityLabel="테마별 구절 추천"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="compass-rose" size={16} color={theme.gold} />
            <Text style={styles.pillText}>테마 구절</Text>
          </Pressable>

          {dailyEntry && (
            <Pressable
              style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
              onPress={() => {
                Haptics.selectionAsync();
                router.push(`/read/${dailyEntry.bookId}/${dailyEntry.chapter}?verse=${dailyEntry.verse}&openMeditation=1`);
              }}
              accessibilityLabel="오늘의 말씀"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="book-open-variant" size={16} color={theme.gold} />
              <Text style={styles.pillText}>오늘의 말씀</Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
            onPress={() => {
              const next = getRandomChapter();
              Haptics.selectionAsync();
              router.push(`/read/${next.bookId}/${next.chapter}`);
            }}
            accessibilityLabel="랜덤 챕터 읽기"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="shuffle-variant" size={16} color={theme.gold} />
            <Text style={styles.pillText}>랜덤</Text>
          </Pressable>
        </View>

        {/* Empty state — 첫 사용자 */}
        {(stats?.totalChapters ?? 0) === 0 && !showOnboarding && (
          <Pressable
            style={({ pressed }) => [styles.emptyCard, pressed && { opacity: 0.8 }]}
            onPress={() => router.push('/read/1/1')}
            accessibilityRole="button"
            accessibilityLabel="창세기 1장 읽기 시작"
          >
            <Text style={styles.emptyTitle}>오늘 창세기 1장부터 시작해볼까요?</Text>
            <Text style={styles.emptyBody}>매일 한 챕터씩 읽으면 3년 안에 성경 전체를 완독할 수 있어요.</Text>
            <View style={styles.emptyAction}>
              <Text style={styles.emptyActionText}>시작하기</Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color={theme.gold} />
            </View>
          </Pressable>
        )}
      </Animated.ScrollView>

      {/* ── Floating CTA ── */}
      <Animated.View style={[styles.fabWrap, { transform: [{ scale: fabScale }, { translateY: fabBounce }] }]}>
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Animated.sequence([
              Animated.timing(fabScale, { toValue: 0.94, duration: 80, useNativeDriver: true }),
              Animated.timing(fabScale, { toValue: 1.04, duration: 100, useNativeDriver: true }),
              Animated.timing(fabScale, { toValue: 1, duration: 60, useNativeDriver: true }),
            ]).start(() => {
              router.push(missionInfo.route);
            });
          }}
          accessibilityLabel={`${missionInfo.title} 읽기 시작`}
          accessibilityRole="button"
        >
          <View style={styles.fabLeft}>
            <Text style={styles.fabTitle}>{missionInfo.title}</Text>
            <Text style={styles.fabSub}>{missionInfo.subtitle}</Text>
          </View>
          <View style={styles.fabArrow}>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.bg} />
          </View>
        </Pressable>
      </Animated.View>

      {/* ── Badge Select Sheet ── */}
      <BadgeSelectSheet
        visible={showBadgeSheet}
        onClose={() => setShowBadgeSheet(false)}
        onSelect={(badge) => {
          setSelectedBadgeIdState(badge?.id ?? null);
        }}
        stats={stats}
        completed={completed}
        meditationCount={meditationCount}
      />

      {/* ── Onboarding Overlay (fullscreen) ── */}
      {showOnboarding && (
        <View style={styles.onboardingOverlay}>
          <Animated.View
            style={[styles.onboardingContent, { transform: [{ translateX: onboardingSlide }] }]}
          >
            {/* 아이콘 */}
            <View style={styles.onboardingIconWrap}>
              <MaterialCommunityIcons name={page.icon} size={80} color={theme.gold} />
            </View>

            <Text style={styles.onboardingTitle}>{page.title}</Text>
            <Text style={styles.onboardingBody}>{page.body}</Text>

            {/* ── 탐색 기능 소개 ── */}
            {page.type === 'explore' && (
              <View style={styles.onboardingExploreCards}>
                {[
                  { icon: 'bookmark-outline', label: '테마 구절', desc: '주제별로 선별된 대표 구절들을 펼쳐보세요.' },
                  { icon: 'weather-sunny', label: '오늘의 말씀', desc: '매일 바뀌는 오늘의 말씀 한 구절.' },
                  { icon: 'shuffle-variant', label: '랜덤', desc: '성령님께 맡기는 오늘의 말씀.' },
                ].map(item => (
                  <View key={item.label} style={styles.onboardingExploreCard}>
                    <MaterialCommunityIcons name={item.icon as any} size={22} color={theme.gold} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.onboardingExploreLabel}>{item.label}</Text>
                      <Text style={styles.onboardingExploreDesc}>{item.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* ── 통독 계획 선택 ── */}
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

            {/* ── 말씀 알림 시간 선택 ── */}
            {page.type === 'verse_notification' && (
              <View style={styles.onboardingTimeSelect}>
                <Text style={styles.onboardingTimeSectionLabel}>알림 시간</Text>
                <View style={styles.onboardingPresetRow}>
                  {([
                    { label: '아침', hour: 7, minute: 0 },
                    { label: '점심', hour: 12, minute: 0 },
                    { label: '오후', hour: 15, minute: 0 },
                    { label: '저녁', hour: 21, minute: 0 },
                  ] as const).map(p => {
                    const active = onboardingVerseHour === p.hour && onboardingVerseMinute === p.minute;
                    return (
                      <Pressable
                        key={p.label}
                        style={[styles.onboardingPresetChip, active && styles.onboardingPresetChipActive]}
                        onPress={() => { setOnboardingVerseHour(p.hour); setOnboardingVerseMinute(p.minute); }}
                      >
                        <Text style={[styles.onboardingPresetLabel, active && styles.onboardingPresetLabelActive]}>
                          {p.label}
                        </Text>
                        <Text style={[styles.onboardingPresetTime, active && styles.onboardingPresetTimeActive]}>
                          {`${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 콘텐츠와 버튼 사이 스페이서 — 버튼을 하단에 고정 */}
            <View style={{ flex: 1 }} />

            {/* 진행 도트 */}
            <View style={styles.dots}>
              {ONBOARDING_PAGES.map((_, i) => (
                <View key={i} style={[styles.dot, i === onboardingPage && styles.dotActive]} />
              ))}
            </View>

            {/* 버튼 영역 */}
            {page.type === 'notification' ? (
              <View style={styles.onboardingNotifBtns}>
                <Pressable
                  style={({ pressed }) => [styles.onboardingBtn, pressed && styles.onboardingBtnPressed]}
                  onPress={requestReadingNotifAndNext}
                >
                  <Text style={styles.onboardingBtnText}>알림 켜기</Text>
                </Pressable>
                <Pressable onPress={nextOnboardingPage} hitSlop={8}>
                  <Text style={styles.onboardingSkipText}>나중에 설정에서 켤게요</Text>
                </Pressable>
              </View>
            ) : page.type === 'verse_notification' ? (
              <View style={styles.onboardingNotifBtns}>
                <Pressable
                  style={({ pressed }) => [styles.onboardingBtn, pressed && styles.onboardingBtnPressed]}
                  onPress={requestVerseNotifAndComplete}
                >
                  <Text style={styles.onboardingBtnText}>말씀 알림 켜기</Text>
                </Pressable>
                <Pressable onPress={completeOnboarding} hitSlop={8}>
                  <Text style={styles.onboardingSkipText}>나중에 설정에서 켤게요</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.onboardingBtn, pressed && styles.onboardingBtnPressed]}
                onPress={nextOnboardingPage}
              >
                <Text style={styles.onboardingBtnText}>다음</Text>
              </Pressable>
            )}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

function makeStyles(scale: number) {
  const fs = (n: number) => Math.round(n * scale);
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  scroll: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 100,
  },

  // Skeleton
  skeleton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  wordmark: {
    fontSize: fs(13),
    fontWeight: '700',
    letterSpacing: 5,
    color: theme.gold,
  },
  searchBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: theme.surface,
  },

  // Greeting
  greeting: {
    fontSize: fs(13),
    color: theme.textMuted,
    marginBottom: 24,
    letterSpacing: 0.2,
  },

  // Hero Flip Card
  flipCardContainer: {
    height: fs(290),
    marginBottom: 28,
    position: 'relative',
  },
  flipFace: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Math.round(6 * scale),
    backfaceVisibility: 'hidden',
  },
  flipBack: {
    backfaceVisibility: 'hidden',
  },

  // Streak front
  streakBigNumber: {
    fontSize: fs(96),
    fontWeight: '900',
    color: theme.gold,
    letterSpacing: 0,
    lineHeight: fs(104),
    paddingHorizontal: 8,
  },
  streakBigLabel: {
    fontSize: fs(18),
    fontWeight: '600',
    color: theme.text,
    letterSpacing: 0.3,
  },
  streakSubtext: {
    fontSize: fs(14),
    color: theme.textMuted,
    letterSpacing: 0.2,
  },
  flipHint: {
    fontSize: fs(10),
    color: theme.textMuted,
    letterSpacing: 0.5,
    opacity: 0.6,
    position: 'absolute',
    bottom: fs(8),
  },

  // XP inline (inside flip front)
  xpInlineSection: {
    width: '80%',
    gap: 6,
    marginTop: 8,
  },
  xpInlineMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xpInlineLabel: {
    fontSize: fs(11),
    color: theme.textMuted,
    letterSpacing: 0.3,
  },

  // Level-up
  levelUpOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,168,71,0.08)',
    borderRadius: 20,
    zIndex: 10,
  },
  levelUpText: {
    fontSize: fs(24),
    fontWeight: '900',
    color: theme.gold,
    letterSpacing: 4,
    textShadowColor: theme.gold,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },

  // XP bar (shared)
  xpBar: {
    height: 4,
    backgroundColor: theme.goldBg,
    borderRadius: 2,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    backgroundColor: theme.gold,
    borderRadius: 2,
  },

  // Section labels
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: fs(10),
    fontWeight: '600',
    color: theme.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Mission Card
  missionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.goldBorder,
    gap: 12,
    // Subtle glow
    shadowColor: theme.gold,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  missionCardPressed: {
    backgroundColor: theme.surface2,
  },
  missionLeft: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.goldBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionContent: {
    flex: 1,
    gap: 2,
  },
  missionTitle: {
    fontSize: fs(18),
    fontWeight: '800',
    color: theme.text,
    letterSpacing: -0.3,
  },
  missionSub: {
    fontSize: fs(13),
    color: theme.textMuted,
    fontWeight: '500',
  },
  missionArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.goldBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Extra plan chapters
  extraChapters: {
    marginTop: 8,
    gap: 6,
  },
  extraChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
  },
  extraChipText: {
    fontSize: fs(14),
    fontWeight: '600',
    color: theme.textSub,
  },

  // Weekly dots
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  weekDayCol: {
    alignItems: 'center',
    gap: 6,
  },
  weekDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.borderSubtle,
  },
  weekDotActive: {
    backgroundColor: theme.gold,
  },
  weekDotToday: {
    borderWidth: 2,
    borderColor: theme.gold,
    backgroundColor: 'transparent',
  },
  weekDayLabel: {
    fontSize: fs(11),
    fontWeight: '600',
    color: theme.textMuted,
  },

  // Explore pills
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.goldBorder,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  pillPressed: {
    backgroundColor: theme.surface2,
  },
  pillText: {
    fontSize: fs(12),
    fontWeight: '600',
    color: theme.gold,
  },

  // Today's plan
  todayPlan: {
    marginBottom: 16,
    gap: 8,
  },
  planItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.goldBorder,
  },
  planItemText: {
    flex: 1,
    fontSize: fs(14),
    fontWeight: '600',
    color: theme.text,
  },
  planDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  planDoneText: {
    fontSize: fs(14),
    color: theme.gold,
    fontWeight: '600',
  },

  // Quick stats
  quickStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 16,
    marginBottom: 4,
  },
  quickStatItem: {
    alignItems: 'center',
    gap: 2,
  },
  quickStatValue: {
    fontSize: fs(20),
    fontWeight: '800',
    color: theme.text,
  },
  quickStatLabel: {
    fontSize: fs(10),
    color: theme.textMuted,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  quickStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.borderSubtle,
  },

  // Daily 묵상 카드
  dailyCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${theme.gold}30`,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  dailyCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dailyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${theme.gold}18`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dailyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.gold,
    letterSpacing: 0.3,
  },
  dailyRef: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.gold,
    letterSpacing: 0.3,
  },
  dailyText: {
    fontSize: 15,
    color: theme.text,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  dailyDivider: {
    height: 1,
    backgroundColor: theme.borderSubtle,
  },
  dailyQuestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  dailyQuestion: {
    flex: 1,
    fontSize: 13,
    color: theme.textSub,
    lineHeight: 19,
  },

  // FAB
  fabWrap: {
    position: 'absolute',
    bottom: 16,
    left: 24,
    right: 24,
  },
  fab: {
    backgroundColor: theme.gold,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: theme.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  fabPressed: {
    backgroundColor: theme.goldDark,
  },
  fabLeft: {
    flex: 1,
  },
  fabTitle: {
    fontSize: fs(16),
    fontWeight: '800',
    color: theme.bg,
    letterSpacing: -0.2,
  },
  fabSub: {
    fontSize: fs(10),
    color: 'rgba(11,10,18,0.5)',
    marginTop: 1,
    letterSpacing: 0.3,
  },
  fabArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(11,10,18,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  emptyCard: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
    borderWidth: 1,
    borderColor: theme.goldBorder,
    gap: 6,
  },
  emptyTitle: {
    fontSize: fs(15),
    fontWeight: '700',
    color: theme.gold,
  },
  emptyBody: {
    fontSize: fs(13),
    color: theme.textSub,
    lineHeight: 20,
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 2,
  },
  emptyActionText: {
    fontSize: fs(13),
    color: theme.gold,
    fontWeight: '600',
  },

  // Onboarding (fullscreen overlay)
  onboardingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.bg,
    zIndex: 999,
  },
  onboardingContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 48,
    gap: 16,
  },
  onboardingIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${theme.gold}18`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  onboardingTitle: {
    fontSize: fs(28),
    fontWeight: '800',
    color: theme.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  onboardingBody: {
    fontSize: fs(15),
    color: theme.textSub,
    textAlign: 'center',
    lineHeight: 24,
  },
  // 탐색 기능 소개 카드
  onboardingExploreCards: {
    width: '100%',
    gap: 10,
    marginTop: 4,
  },
  onboardingExploreCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: theme.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.goldBorder,
  },
  onboardingExploreLabel: {
    fontSize: fs(14),
    fontWeight: '700',
    color: theme.text,
  },
  onboardingExploreDesc: {
    fontSize: fs(12),
    color: theme.textMuted,
    lineHeight: 18,
  },
  // 말씀 알림 시간 선택
  onboardingTimeSelect: {
    width: '100%',
    gap: 10,
    marginTop: 4,
  },
  onboardingTimeSectionLabel: {
    fontSize: fs(12),
    color: theme.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  onboardingPresetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  onboardingPresetChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    backgroundColor: theme.surface,
    gap: 3,
  },
  onboardingPresetChipActive: {
    borderColor: theme.gold,
    backgroundColor: `${theme.gold}18`,
  },
  onboardingPresetLabel: {
    fontSize: fs(12),
    fontWeight: '600',
    color: theme.textMuted,
  },
  onboardingPresetLabelActive: { color: theme.gold },
  onboardingPresetTime: {
    fontSize: fs(12),
    fontWeight: '700',
    color: theme.textSub,
  },
  onboardingPresetTimeActive: { color: theme.gold },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 4,
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
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    width: '100%',
    marginTop: 4,
  },
  onboardingBtnPressed: { backgroundColor: theme.goldDark },
  onboardingBtnText: {
    fontSize: fs(16),
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
    fontSize: fs(13),
    color: theme.textMuted,
  },
  onboardingPlanList: {
    width: '100%',
    maxHeight: 220,
  },
  onboardingPlanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.goldBorder,
    backgroundColor: theme.surface,
    gap: 8,
  },
  onboardingPlanChipSelected: {
    backgroundColor: theme.gold,
    borderColor: theme.gold,
  },
  onboardingPlanChipText: {
    fontSize: fs(13),
    fontWeight: '600',
    color: theme.text,
    flex: 1,
  },
  onboardingPlanChipTextSelected: {
    color: theme.bg,
  },
  onboardingPlanChipHint: {
    fontSize: fs(11),
    color: theme.textMuted,
    marginTop: 1,
  },
  });
}

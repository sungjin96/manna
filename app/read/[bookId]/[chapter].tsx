import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useBibleText } from '../../../hooks/useBibleText';
import { useReaderSettings, READER_THEMES, ReaderTheme } from '../../../hooks/useReaderSettings';
import { useTTS, TTS_RATE_LABELS } from '../../../hooks/useTTS';
import { useHeaderAnim } from '../../../hooks/useHeaderAnim';
import { useMeditationSheet, type MeditationMode, type QAEntry } from '../../../hooks/useMeditationSheet';
import { useSettingsSheet } from '../../../hooks/useSettingsSheet';
import { useConfetti } from '../../../hooks/useConfetti';
import {
  markChapterComplete, unmarkChapterComplete, isChapterComplete,
  markVerseRead, unmarkVerseRead, getReadVerses, getAllCompletedChapters,
} from '../../../db/readings';
import { getStats } from '../../../db/stats';
import { saveMeditation, getMeditationsForChapter, getMeditationCount, type Meditation } from '../../../db/meditations';
import { getSetting, setSetting } from '../../../db/settings';
import { getAICache, setAICache, getAITypeCache, setAITypeCache, clearAITypeCache, getDailyRefreshCount, incrementDailyRefresh, getDailyAILimit } from '../../../db/ai_cache';
import {
  generateMeditationPrompts, generateExplanation, generatePrayer,
  aiErrorMessage, type ExplanationResult,
} from '../../../utils/ai-meditation';
import { getAppUserId, checkAIEntitlement, purchasePremium } from '../../../utils/subscriptions';
import { BOOKS } from '../../../constants/books';
import { styles, HEADER_H, PROGRESS_H } from './chapter.styles';
import { BADGES, BOOK_BADGES } from '../../../app/(tabs)/achievements';
import { useShowBadgeToast } from '../../../contexts/BadgeToastContext';
import { useTutorial } from '../../../hooks/useTutorial';
import { ReadingTutorial } from '../../../components/ReadingTutorial';
import PaywallSheet from '../../../components/PaywallSheet';

// ── Helper ─────────────────────────────────────────────────────────────────
function nextAfter(bookId: number, chapter: number): { bookId: number; chapter: number } {
  const book = BOOKS.find(b => b.id === bookId);
  if (!book) return { bookId: 1, chapter: 1 };
  if (chapter < book.chapters) return { bookId, chapter: chapter + 1 };
  const nextBook = BOOKS.find(b => b.id === bookId + 1);
  return nextBook ? { bookId: nextBook.id, chapter: 1 } : { bookId: 1, chapter: 1 };
}

function prevBefore(bookId: number, chapter: number): { bookId: number; chapter: number } | null {
  if (bookId === 1 && chapter === 1) return null;
  if (chapter > 1) return { bookId, chapter: chapter - 1 };
  const prevBook = BOOKS.find(b => b.id === bookId - 1);
  return prevBook ? { bookId: prevBook.id, chapter: prevBook.chapters } : null;
}

// ── Main screen ────────────────────────────────────────────────────────────
export default function ReadScreen() {
  const { bookId: bookIdStr, chapter: chapterStr } = useLocalSearchParams<{
    bookId: string; chapter: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const bookId = Number(bookIdStr);
  const chapter = Number(chapterStr);
  const book = BOOKS.find(b => b.id === bookId);

  const { verses, loading, error } = useBibleText(bookId, chapter);
  const { settings, update: updateSettings, colors } = useReaderSettings();

  // ── State ─────────────────────────────────────────────────────────────────
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [readVerses, setReadVerses] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [meditationPromptEnabled, setMeditationPromptEnabled] = useState(true);
  const [aiPrompts, setAiPrompts] = useState<string[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [aiVerseRef, setAiVerseRef] = useState('');
  const [aiTab, setAiTab] = useState<'meditate' | 'explain' | 'prayer'>('meditate');
  const [aiSelectedVerses, setAiSelectedVerses] = useState<Array<{ verse: number; text: string }>>([]);
  const [aiExplanation, setAiExplanation] = useState<ExplanationResult | null>(null);
  const [aiExplainLoading, setAiExplainLoading] = useState(false);
  const [aiExplainError, setAiExplainError] = useState<string | null>(null);
  const [aiPrayer, setAiPrayer] = useState<string | null>(null);
  const [aiPrayerLoading, setAiPrayerLoading] = useState(false);
  const [aiPrayerError, setAiPrayerError] = useState<string | null>(null);
  const [aiDailyRefreshCount, setAiDailyRefreshCount] = useState(0);
  const [streakMilestone, setStreakMilestone] = useState<number | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallLoading, setPaywallLoading] = useState(false);
  const [isProUser, setIsProUser] = useState(false);
  const milestoneScale = useRef(new Animated.Value(0)).current;
  const milestoneOpacity = useRef(new Animated.Value(0)).current;

  // Feature 2: Meditation markers
  const [chapterMeditations, setChapterMeditations] = useState<Meditation[]>([]);
  const [showMeditationMarkers, setShowMeditationMarkers] = useState(true);
  const [meditationPopupVerse, setMeditationPopupVerse] = useState<number | null>(null);
  const [meditationPopupItems, setMeditationPopupItems] = useState<Meditation[]>([]);

  const flatListRef = useRef<FlatList>(null);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const HEADER_FULL_H = insets.top + HEADER_H + PROGRESS_H;

  function navigateNext() {
    const next = nextAfter(bookId, chapter);
    router.replace(`/read/${next.bookId}/${next.chapter}`);
  }

  const {
    isTTS, ttsVerse, ttsRateIdx, showTTSMenu, noKoreanVoice,
    availableVoices, selectedVoiceId, setShowTTSMenu,
    toggleTTS, selectTTSRate, selectVoice,
  } = useTTS(verses);

  const { headerOpacity, headerHeightValue, bottomNavOpacity, handleScroll } = useHeaderAnim(HEADER_FULL_H);

  const {
    showMeditation, meditationVerse, setMeditationVerse,
    note, setNote,
    meditationMode, setMeditationMode,
    qaEntries, setQaEntries,
    meditationSheetY, meditationBgOpacity, meditationPR,
    openMeditationSheet, closeMeditationSheet,
  } = useMeditationSheet(navigateNext);

  const {
    showSettings,
    settingsSheetY, settingsBgOpacity, settingsPR,
    openSettingsSheet, closeSettingsSheet,
  } = useSettingsSheet();

  const { showConfetti, particles, fireConfetti } = useConfetti();

  // Feature 4: Badge toast (global context — persists across navigation)
  const showBadgeToast = useShowBadgeToast();
  // AI 선택 구절 범위 (새로고침용)
  const aiVerseRange = useRef<{ start: number; end: number } | null>(null);
  // Feature 1: Tutorial
  const { isActive: tutorialActive, step: tutorialStep, overlayOpacity: tutorialOpacity, advanceStep: tutorialAdvance, dismiss: tutorialDismiss } = useTutorial();

  // ── Initial data load ─────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      isChapterComplete(bookId, chapter),
      getReadVerses(bookId, chapter),
      getSetting('meditation_prompt_enabled', '0'),
      checkAIEntitlement(),
      getMeditationsForChapter(bookId, chapter),
      getSetting('show_meditation_markers', '1'),
    ]).then(([done, rv, promptSetting, entitled, meditations, markerSetting]) => {
      setAlreadyDone(done);
      setReadVerses(rv);
      setMeditationPromptEnabled(promptSetting === '1');
      setIsProUser(entitled);
      setChapterMeditations(meditations as Meditation[]);
      setShowMeditationMarkers((markerSetting as string) !== '0');
    });
  }, [bookId, chapter]);

  // Idea 3: completed chapter → show all verses as read
  useEffect(() => {
    if (alreadyDone && verses && verses.length > 0) {
      setReadVerses(prev => {
        if (prev.size === verses.length) return prev;
        return new Set(verses.map(v => v.verse));
      });
    }
  }, [alreadyDone, verses?.length]);

  // Auto-scroll to first unread verse
  const didAutoScroll = useRef(false);
  useEffect(() => {
    if (didAutoScroll.current) return;
    if (!verses || verses.length === 0 || readVerses.size === 0) return;
    if (readVerses.size >= verses.length) return;
    didAutoScroll.current = true;
    const firstUnreadIndex = verses.findIndex(v => !readVerses.has(v.verse));
    if (firstUnreadIndex > 2) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: firstUnreadIndex, animated: true, viewOffset: 20,
        });
      }, 300);
    }
  }, [verses, readVerses.size]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getVerseMeditations(verseNum: number): Meditation[] {
    return chapterMeditations.filter(m => {
      const start = m.verseStart ?? m.verseEnd ?? verseNum;
      const end = m.verseEnd ?? m.verseStart ?? verseNum;
      return verseNum >= start && verseNum <= end;
    });
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  async function checkAndShowNewBadges() {
    const [completedSet, meditationCount, stats, storedRaw] = await Promise.all([
      getAllCompletedChapters(),
      getMeditationCount(),
      getStats(),
      getSetting('earned_badge_ids', ''),
    ]);
    const storedIds = new Set((storedRaw as string).split(',').filter(Boolean));
    const allBadges = [...BADGES, ...BOOK_BADGES];
    const newlyEarned = allBadges.filter(b => !storedIds.has(b.id) && b.check(stats, completedSet, meditationCount));
    if (newlyEarned.length === 0) return;
    const allIds = [...Array.from(storedIds), ...newlyEarned.map(b => b.id)].join(',');
    await setSetting('earned_badge_ids', allIds);
    const HAPTIC_MAP: Record<string, () => Promise<void>> = {
      bronze:  () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      silver:  () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
      gold:    () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
      diamond: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    };
    for (const badge of newlyEarned) {
      HAPTIC_MAP[badge.tier]?.();
      showBadgeToast({ id: badge.id, icon: badge.icon, title: badge.title, tier: badge.tier });
    }
  }

  // ── Verse interactions ────────────────────────────────────────────────────
  async function handleVerseTap(verseNum: number) {
    if (selectionMode) {
      // 단일 선택 상태에서 같은 절을 다시 탭하면 선택 취소
      if (selectionRange && selectionRange.start === verseNum && selectionRange.end === verseNum) {
        cancelSelection();
        return;
      }
      setSelectionRange(prev => {
        if (!prev) return { start: verseNum, end: verseNum };
        return { start: Math.min(prev.start, verseNum), end: Math.max(prev.end, verseNum) };
      });
      return;
    }
    if (readVerses.has(verseNum)) {
      await unmarkVerseRead(bookId, chapter, verseNum);
      setReadVerses(prev => { const next = new Set(prev); next.delete(verseNum); return next; });
      // 항목 2: 완료된 챕터에서 절 해제 시 챕터 완료도 해제
      if (alreadyDone) {
        await unmarkChapterComplete(bookId, chapter);
        setAlreadyDone(false);
      }
    } else {
      await markVerseRead(bookId, chapter, verseNum);
      const newSet = new Set([...readVerses, verseNum]);
      setReadVerses(newSet);
      // Idea 1: auto-complete on last verse
      if (verses && newSet.size === verses.length && !alreadyDone) {
        await handleComplete();
        return;
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleVerseLongPress(verseNum: number) {
    setSelectionMode(true);
    setSelectionRange({ start: verseNum, end: verseNum });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function cancelSelection() {
    setSelectionMode(false);
    setSelectionRange(null);
  }

  function openVerseMeditation() {
    if (!selectionRange) return;
    setMeditationVerse(selectionRange);
    setNote('');
    cancelSelection();
    openMeditationSheet();
  }

  async function openAIMeditation() {
    if (!selectionRange || !verses) return;

    const selected = verses.filter(v => v.verse >= selectionRange.start && v.verse <= selectionRange.end);
    const ref = `${book?.name} ${chapter}:${selectionRange.start}${selectionRange.start !== selectionRange.end ? `–${selectionRange.end}` : ''}`;
    setAiVerseRef(ref);
    setAiSelectedVerses(selected);
    cancelSelection();
    // 선택 범위 저장 (새로고침용)
    aiVerseRange.current = { start: selectionRange.start, end: selectionRange.end };
    // Reset all tab state — 기능 선택 후 로드 (자동 호출 없음)
    setAiTab('meditate');
    setAiPrompts(null);
    setAiExplanation(null);
    setAiPrayer(null);
    setAiLoading(false);
    setShowAiSheet(true);
    // 오늘 남은 횟수 로드
    getDailyRefreshCount().then(c => setAiDailyRefreshCount(c));
  }

  // 묵상 시트 안에서 AI 질문 생성 (Pro 전용)
  async function generateInModal() {
    if (!verses || verses.length === 0) return;
    const start = meditationVerse?.start ?? verses[0].verse;
    const end = meditationVerse?.end ?? verses[verses.length - 1].verse;
    const selected = verses.filter(v => v.verse >= start && v.verse <= end);
    const ref = `${book?.name ?? ''} ${chapter}:${start}${start !== end ? `~${end}` : ''}`;

    const cached = await getAICache(bookId, chapter, start, end);
    if (cached) {
      setQaEntries(cached.map(q => ({ q, a: '' })));
      return;
    }

    setAiLoading(true);
    const appUserId = await getAppUserId();
    const result = await generateMeditationPrompts(selected, ref, appUserId);
    setAiLoading(false);

    if (result.data) {
      await setAICache(bookId, chapter, result.data.prompts, start, end);
      setQaEntries(result.data.prompts.map(q => ({ q, a: '' })));
    }
  }

  async function handleAiTabChange(tab: 'meditate' | 'explain' | 'prayer') {
    setAiTab(tab);
    const dailyLimit = getDailyAILimit(isProUser);
    const appUserId = await getAppUserId();

    const { start, end } = aiVerseRange.current ?? {};

    if (tab === 'meditate' && !aiPrompts && !aiLoading) {
      // 캐시 확인
      const cached = await getAICache(bookId, chapter, start, end);
      if (cached) { setAiPrompts(cached); return; }

      // 캐시 미스 → 일일 한도 확인
      const currentCount = await getDailyRefreshCount();
      if (currentCount >= dailyLimit) {
        setAiPrompts([`오늘 AI 조회 횟수(${dailyLimit}회)를 모두 사용했습니다. 내일 다시 시도해주세요.`]);
        return;
      }

      // 무료 유저는 구독 체크 (Pro는 이미 확인됨)
      if (!isProUser) {
        const entitled = await checkAIEntitlement();
        if (entitled) setIsProUser(true);
      }

      setAiLoading(true);
      const result = await generateMeditationPrompts(aiSelectedVerses, aiVerseRef, appUserId);
      if (result.data) {
        setAiPrompts(result.data.prompts);
        await setAICache(bookId, chapter, result.data.prompts, start, end);
        const newCount = await incrementDailyRefresh();
        setAiDailyRefreshCount(newCount);
      } else {
        setAiPrompts([aiErrorMessage(result.error!)]);
      }
      setAiLoading(false);
    }

    if (tab === 'explain' && !aiExplanation && !aiExplainLoading) {
      // 캐시 확인
      const cached = await getAITypeCache<ExplanationResult>(
        'explain', bookId, chapter, start, end
      );
      if (cached) { setAiExplanation(cached); return; }

      // 캐시 미스 → 일일 한도 확인
      const currentCount = await getDailyRefreshCount();
      if (currentCount >= dailyLimit) {
        setAiExplainError(`오늘 AI 조회 횟수(${dailyLimit}회)를 모두 사용했습니다.`);
        return;
      }

      setAiExplainError(null);
      setAiExplainLoading(true);
      const result = await generateExplanation(aiSelectedVerses, aiVerseRef, appUserId);
      setAiExplainLoading(false);
      if (result.data) {
        setAiExplanation(result.data);
        await setAITypeCache('explain', bookId, chapter, result.data, start, end);
        const newCount = await incrementDailyRefresh();
        setAiDailyRefreshCount(newCount);
      } else {
        setAiExplainError(result.error ?? 'unknown_error');
      }
    }

    if (tab === 'prayer' && !aiPrayer && !aiPrayerLoading) {
      // 캐시 확인
      const cached = await getAITypeCache<string>('prayer', bookId, chapter, start, end);
      if (cached) { setAiPrayer(cached); return; }

      // 캐시 미스 → 일일 한도 확인
      const currentCount = await getDailyRefreshCount();
      if (currentCount >= dailyLimit) {
        setAiPrayerError(`오늘 AI 조회 횟수(${dailyLimit}회)를 모두 사용했습니다.`);
        return;
      }

      setAiPrayerError(null);
      setAiPrayerLoading(true);
      const result = await generatePrayer(aiSelectedVerses, aiVerseRef, appUserId);
      setAiPrayerLoading(false);
      if (result.data) {
        setAiPrayer(result.data);
        await setAITypeCache('prayer', bookId, chapter, result.data, start, end);
        const newCount = await incrementDailyRefresh();
        setAiDailyRefreshCount(newCount);
      } else {
        setAiPrayerError(result.error ?? 'unknown_error');
      }
    }
  }

  async function handlePurchase() {
    setPaywallLoading(true);
    const result = await purchasePremium();
    setPaywallLoading(false);
    if (result.success) {
      setShowPaywall(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  async function copySelectedVerses() {
    if (!selectionRange || !verses) return;
    const selected = verses.filter(v => v.verse >= selectionRange.start && v.verse <= selectionRange.end);
    const ref = `${book?.name} ${chapter}:${selectionRange.start}${selectionRange.start !== selectionRange.end ? `–${selectionRange.end}` : ''}`;
    const text = selected.map(v => `${v.verse} ${v.text}`).join('\n');
    await Clipboard.setStringAsync(`${ref}\n${text}`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    cancelSelection();
  }

  // ── Chapter complete ───────────────────────────────────────────────────────
  const STREAK_MILESTONES = [5, 30, 100];

  async function handleComplete() {
    if (alreadyDone || selectionMode) return;
    fireConfetti();
    await markChapterComplete(bookId, chapter);
    setAlreadyDone(true);
    // Idea 3: mark all verses as read on complete
    if (verses && verses.length > 0) {
      const allNums = verses.map(v => v.verse);
      await Promise.all(allNums.map(v => markVerseRead(bookId, chapter, v)));
      setReadVerses(new Set(allNums));
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Feature 4: check for newly earned badges
    checkAndShowNewBadges();

    const { currentStreak } = await getStats();
    if (STREAK_MILESTONES.includes(currentStreak)) {
      milestoneScale.setValue(0);
      milestoneOpacity.setValue(0);
      setStreakMilestone(currentStreak);
      Animated.parallel([
        Animated.spring(milestoneScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(milestoneOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
      return;
    }

    if (meditationPromptEnabled) {
      // Feature 3: auto-set full chapter range
      const lastVerse = verses ? verses[verses.length - 1]?.verse : undefined;
      setTimeout(() => {
        setMeditationVerse(lastVerse ? { start: 1, end: lastVerse } : null);
        setNote('');
        if (isProUser) {
          setMeditationMode('qa');
          openMeditationSheet();
          generateInModal();
        } else {
          setMeditationMode('basic');
          openMeditationSheet();
        }
      }, 400);
    } else {
      setTimeout(() => navigateNext(), 400);
    }
  }

  // Idea 2: undo chapter complete
  async function handleUncomplete() {
    await unmarkChapterComplete(bookId, chapter);
    setAlreadyDone(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function closeMilestone() {
    Animated.timing(milestoneOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setStreakMilestone(null);
      if (meditationPromptEnabled) {
        // Feature 3: auto-set full chapter range
        const lastVerse = verses ? verses[verses.length - 1]?.verse : undefined;
        setMeditationVerse(lastVerse ? { start: 1, end: lastVerse } : null);
        setNote('');
        if (isProUser) {
          setMeditationMode('qa');
          openMeditationSheet();
          generateInModal();
        } else {
          setMeditationMode('basic');
          openMeditationSheet();
        }
      } else {
        navigateNext();
      }
    });
  }

  async function handleSaveMeditation() {
    const wasChapter = meditationVerse === null;
    if (meditationMode === 'qa') {
      const validEntries = qaEntries.filter(e => e.q.trim() || e.a.trim());
      if (validEntries.length > 0) {
        const noteToSave = JSON.stringify({ type: 'qa', entries: validEntries });
        await saveMeditation(bookId, chapter, noteToSave, meditationVerse?.start, meditationVerse?.end);
      }
    } else if (note.trim()) {
      await saveMeditation(bookId, chapter, note.trim(), meditationVerse?.start, meditationVerse?.end);
    }
    // Feature 2: reload meditation markers
    getMeditationsForChapter(bookId, chapter).then(setChapterMeditations);
    closeMeditationSheet(() => { if (wasChapter) navigateNext(); });
  }

  async function toggleMeditationPrompt(val: boolean) {
    setMeditationPromptEnabled(val);
    await setSetting('meditation_prompt_enabled', val ? '1' : '0');
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const title = book ? `${book.name} ${chapter}장` : `${bookId}:${chapter}`;
  const totalVerses = verses?.length ?? 0;
  const readCount = readVerses.size;
  const progressPct = totalVerses > 0 ? readCount / totalVerses : 0;
  const fontFamily = settings.font === 'serif'
    ? (Platform.OS === 'ios' ? 'Georgia' : 'serif') : undefined;
  const verseLabel = selectionRange
    ? `${book?.name} ${chapter}:${selectionRange.start}${selectionRange.start !== selectionRange.end ? `–${selectionRange.end}` : ''} 선택됨`
    : '';

  // ── Render verse row ──────────────────────────────────────────────────────
  const renderVerse = useCallback(({ item }: { item: { verse: number; text: string } }) => {
    const isRead = readVerses.has(item.verse);
    const inSelection = selectionMode && selectionRange
      && item.verse >= selectionRange.start && item.verse <= selectionRange.end;
    const isTTSActive = isTTS && ttsVerse === item.verse;
    const hasMeditation = showMeditationMarkers && getVerseMeditations(item.verse).length > 0;

    return (
      <Pressable
        onPress={() => handleVerseTap(item.verse)}
        onLongPress={() => handleVerseLongPress(item.verse)}
        delayLongPress={400}
        style={[
          styles.verseRow,
          inSelection && { backgroundColor: `${colors.gold}20`, borderRadius: 6 },
          isTTSActive && { backgroundColor: `${colors.gold}12` },
        ]}
      >
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.verseNum, { color: colors.gold, fontFamily }, isRead && { opacity: 0.35 }]}>
            {item.verse}
          </Text>
          {hasMeditation && (
            <Pressable
              hitSlop={8}
              onPress={() => {
                const items = getVerseMeditations(item.verse);
                setMeditationPopupVerse(item.verse);
                setMeditationPopupItems(items);
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold, marginTop: 2 }} />
            </Pressable>
          )}
        </View>
        <Text style={[
          styles.verseText,
          { color: colors.text, fontSize: settings.fontSize, lineHeight: settings.fontSize * settings.lineHeight, fontFamily },
          isRead && { opacity: 0.45 },
        ]}>
          {item.text}
        </Text>
      </Pressable>
    );
  }, [readVerses, selectionMode, selectionRange, isTTS, ttsVerse, settings, colors, fontFamily, chapterMeditations, showMeditationMarkers]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title }} />
      <View style={[styles.container, { backgroundColor: colors.bg }]}>

        {/* Collapsible header */}
        <Animated.View style={[
          styles.headerWrapper,
          { height: headerHeightValue, opacity: headerOpacity, backgroundColor: colors.headerBg, borderBottomColor: colors.border },
        ]}>
          <View style={[styles.headerInner, { paddingTop: insets.top }]}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
              <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
            <View style={styles.headerRight}>
              {isTTS && (
                <Pressable onPress={() => setShowTTSMenu(v => !v)} style={styles.ttsRateBtn} hitSlop={8}>
                  <Text style={[styles.ttsRateLabel, { color: colors.gold }]}>{TTS_RATE_LABELS[ttsRateIdx]}</Text>
                  <MaterialCommunityIcons name="chevron-down" size={12} color={colors.gold} style={{ marginLeft: 1 }} />
                </Pressable>
              )}
              <Pressable
                onPress={() => {
                  if (noKoreanVoice && !isTTS) {
                    Alert.alert(
                      '한국어 음성 미설치',
                      'TTS가 작동하려면 한국어(대한민국) 음성이 필요합니다.\n\n설정 → 손쉬운 사용 → 콘텐츠 말하기 → 음성에서 다운로드하세요.',
                      [{ text: '확인' }]
                    );
                    return;
                  }
                  toggleTTS();
                }}
                style={styles.headerIconBtn}
                hitSlop={8}
              >
                <MaterialCommunityIcons name={isTTS ? 'volume-high' : 'volume-off'} size={20} color={isTTS ? colors.gold : colors.muted} />
              </Pressable>
              <Pressable onPress={openSettingsSheet} style={styles.headerIconBtn} hitSlop={8}>
                <MaterialCommunityIcons name="format-size" size={20} color={colors.muted} />
              </Pressable>
            </View>
          </View>
          {totalVerses > 0 && (
            <View style={[styles.progressStrip, { borderTopColor: colors.border }]}>
              <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { width: `${progressPct * 100}%` as any, backgroundColor: colors.gold }]} />
              </View>
              <Text style={[styles.progressLabel, { color: colors.muted }]}>{readCount}/{totalVerses}절</Text>
            </View>
          )}
        </Animated.View>

        {/* TTS settings panel (speed + voice) */}
        {showTTSMenu && (
          <>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowTTSMenu(false)} />
            <View style={[styles.ttsMenu, { backgroundColor: colors.surface, borderColor: colors.border, top: insets.top + HEADER_H - 4 }]}>
              {/* 읽기 속도 */}
              <Text style={[styles.ttsMenuSection, { color: colors.muted }]}>읽기 속도</Text>
              {TTS_RATE_LABELS.map((label, idx) => (
                <Pressable key={idx} style={[styles.ttsMenuItem, idx === ttsRateIdx && { backgroundColor: `${colors.gold}18` }]} onPress={() => selectTTSRate(idx)}>
                  <Text style={[styles.ttsMenuLabel, { color: idx === ttsRateIdx ? colors.gold : colors.text }]}>{label}</Text>
                  {idx === ttsRateIdx && <MaterialCommunityIcons name="check" size={14} color={colors.gold} />}
                </Pressable>
              ))}

              {/* 목소리 선택 */}
              {availableVoices.length > 1 && (
                <>
                  <View style={[styles.ttsMenuDivider, { backgroundColor: colors.border }]} />
                  <Text style={[styles.ttsMenuSection, { color: colors.muted }]}>목소리</Text>
                  {availableVoices.map(voice => {
                    const active = voice.identifier === selectedVoiceId;
                    return (
                      <Pressable
                        key={voice.identifier}
                        style={[styles.ttsMenuItem, active && { backgroundColor: `${colors.gold}18` }]}
                        onPress={() => selectVoice(voice.identifier)}
                      >
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.ttsMenuLabel, { color: active ? colors.gold : colors.text }]}>{voice.name}</Text>
                          {voice.quality === 'Enhanced' && (
                            <View style={{ backgroundColor: `${colors.gold}20`, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                              <Text style={{ fontSize: 9, color: colors.gold, fontWeight: '600' }}>HD</Text>
                            </View>
                          )}
                        </View>
                        {active && <MaterialCommunityIcons name="check" size={14} color={colors.gold} />}
                      </Pressable>
                    );
                  })}
                </>
              )}
            </View>
          </>
        )}

        {/* Bible content */}
        {loading ? (
          <View style={styles.center}><Text style={[styles.loadingText, { color: colors.muted }]}>읽는 중...</Text></View>
        ) : error ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.muted} />
            <Text style={[styles.loadingText, { color: colors.muted, marginTop: 12 }]}>본문을 불러올 수 없어요</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={verses}
            keyExtractor={v => String(v.verse)}
            contentContainerStyle={styles.list}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onScrollToIndexFailed={() => {}}
            renderItem={renderVerse}
            ListFooterComponent={
              <Pressable
                style={({ pressed }) => [
                  styles.completeBtn,
                  alreadyDone && { backgroundColor: 'transparent', borderWidth: 1, borderColor: `${colors.gold}40` },
                  pressed && styles.completeBtnPressed,
                ]}
                onPress={alreadyDone ? handleUncomplete : handleComplete}
              >
                {alreadyDone ? (
                  <View style={styles.doneBtnInner}>
                    <MaterialCommunityIcons name="check-circle" size={18} color={`${colors.gold}60`} />
                    <Text style={[styles.completeBtnText, { color: `${colors.gold}60` }]}>완료됨</Text>
                  </View>
                ) : (
                  <Text style={[styles.completeBtnText, { color: '#0B0A12' }]}>읽기 완료</Text>
                )}
              </Pressable>
            }
          />
        )}

        {/* Confetti overlay */}
        {showConfetti && (
          <View style={styles.confettiOverlay} pointerEvents="none">
            {particles.map((p, i) => (
              <Animated.View
                key={i}
                style={[styles.particle, {
                  width: p.size, height: p.size, borderRadius: p.size / 2,
                  backgroundColor: p.color, opacity: p.opacity,
                  transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.scale }],
                }]}
              />
            ))}
          </View>
        )}

        {/* Streak milestone modal */}
        {streakMilestone !== null && (
          <Animated.View style={[milestoneStyles.overlay, { opacity: milestoneOpacity }]}>
            <Animated.View style={[milestoneStyles.card, { backgroundColor: colors.surface, transform: [{ scale: milestoneScale }] }]}>
              <Text style={milestoneStyles.flame}>🔥</Text>
              <Text style={[milestoneStyles.count, { color: colors.gold }]}>{streakMilestone}일</Text>
              <Text style={[milestoneStyles.title, { color: colors.text }]}>연속 읽기 달성!</Text>
              <Text style={[milestoneStyles.desc, { color: colors.muted }]}>
                {streakMilestone === 5 && '첫 번째 마일스톤을 달성했어요.\n말씀의 습관이 자리잡고 있습니다.'}
                {streakMilestone === 30 && '30일 연속! 놀라운 헌신이에요.\n한 달 동안 매일 말씀을 읽었습니다.'}
                {streakMilestone === 100 && '100일 연속! 이것은 기적이에요.\n당신의 믿음이 빛나고 있습니다.'}
              </Text>
              <Pressable style={[milestoneStyles.btn, { backgroundColor: colors.gold }]} onPress={closeMilestone}>
                <Text style={[milestoneStyles.btnText, { color: colors.bg }]}>계속 읽기</Text>
              </Pressable>
            </Animated.View>
          </Animated.View>
        )}

        {/* 항목 3: 스크롤 연동 하단 prev/next 바 */}
        {!selectionMode && (
          <Animated.View style={[
            meditStyles.bottomNav,
            { backgroundColor: colors.headerBg, borderTopColor: colors.border, paddingBottom: insets.bottom + 4 },
            { opacity: bottomNavOpacity },
          ]}>
            <Pressable style={meditStyles.bottomNavBtn} onPress={() => {
              const prev = prevBefore(bookId, chapter);
              if (prev) router.replace(`/read/${prev.bookId}/${prev.chapter}`);
            }} hitSlop={8}>
              <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
              <Text style={[meditStyles.bottomNavText, { color: colors.muted }]}>이전</Text>
            </Pressable>
            <Text style={[meditStyles.bottomNavChapter, { color: colors.muted }]}>{title}</Text>
            <Pressable style={meditStyles.bottomNavBtn} onPress={navigateNext} hitSlop={8}>
              <Text style={[meditStyles.bottomNavText, { color: colors.muted }]}>다음</Text>
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
            </Pressable>
          </Animated.View>
        )}

        {/* Selection bar */}
        {selectionMode && selectionRange && (
          <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
            <Text style={[styles.selectionLabel, { color: colors.text }]} numberOfLines={1}>{verseLabel}</Text>
            <View style={styles.selectionActions}>
              <Pressable style={[styles.selBtn, { backgroundColor: colors.gold }]} onPress={openVerseMeditation}>
                <MaterialCommunityIcons name="notebook-edit-outline" size={15} color="#0B0A12" />
                <Text style={[styles.selBtnText, { color: '#0B0A12' }]}>묵상</Text>
              </Pressable>
              <Pressable style={[styles.selBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={openAIMeditation}>
                <MaterialCommunityIcons name="robot-outline" size={15} color={colors.gold} />
                <Text style={[styles.selBtnText, { color: colors.gold }]}>AI</Text>
              </Pressable>
              <Pressable style={[styles.selBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={copySelectedVerses}>
                <MaterialCommunityIcons name="content-copy" size={15} color={colors.text} />
                <Text style={[styles.selBtnText, { color: colors.text }]}>복사</Text>
              </Pressable>
              <Pressable style={styles.selBtnCancel} onPress={cancelSelection} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>
          </View>
        )}

        {/* Meditation modal */}
        <Modal visible={showMeditation} transparent animationType="none">
          <Animated.View style={[styles.backdrop, { opacity: meditationBgOpacity }]} />
          <KeyboardAvoidingView style={styles.overlayInner} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => closeMeditationSheet()} />
            <Animated.View style={[
              styles.modal,
              { maxHeight: '88%' },
              { backgroundColor: colors.surface, borderTopColor: colors.border },
              { transform: [{ translateY: meditationSheetY }] },
            ]}>
              <View {...meditationPR.panHandlers} style={styles.handleArea}>
                <View style={[styles.modalHandle, { backgroundColor: colors.muted }]} />
              </View>
              {/* 헤더: 제목 + 절 참조를 한 줄에 */}
              <View style={meditStyles.sheetHeader}>
                <Text style={[meditStyles.sheetTitle, { color: colors.text }]}>묵상</Text>
                <Text style={[meditStyles.sheetRef, { color: colors.gold }]}>
                  {meditationVerse
                    ? `${book?.name} ${chapter}:${meditationVerse.start}${meditationVerse.start !== meditationVerse.end ? `–${meditationVerse.end}` : ''}`
                    : `${book?.name} ${chapter}장`}
                </Text>
              </View>

              {meditationMode === 'qa' ? (
                /* Q&A 모드 — 스크롤 가능 */
                <ScrollView
                  style={meditStyles.qaScrollView}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {qaEntries.map((entry, idx) => (
                    <View key={idx} style={meditStyles.qaEntry}>
                      {/* 질문 번호 + 질문 입력 */}
                      <View style={meditStyles.qaRow}>
                        <Text style={[meditStyles.qaNum, { color: colors.gold }]}>{idx + 1}</Text>
                        <View style={meditStyles.qaInputCol}>
                          <TextInput
                            style={[meditStyles.qaQ, { color: colors.text }]}
                            placeholder="질문을 입력하세요"
                            placeholderTextColor={colors.muted}
                            multiline
                            value={entry.q}
                            onChangeText={text => setQaEntries(prev => prev.map((e, i) => i === idx ? { ...e, q: text } : e))}
                          />
                          {/* 구분선 */}
                          <View style={[meditStyles.qaDiv, { backgroundColor: colors.border }]} />
                          <TextInput
                            style={[meditStyles.qaA, { color: colors.text }]}
                            placeholder="묵상 내용..."
                            placeholderTextColor={colors.muted}
                            multiline
                            value={entry.a}
                            onChangeText={text => setQaEntries(prev => prev.map((e, i) => i === idx ? { ...e, a: text } : e))}
                          />
                        </View>
                        {qaEntries.length > 1 && (
                          <Pressable hitSlop={10} onPress={() => setQaEntries(prev => prev.filter((_, i) => i !== idx))}>
                            <MaterialCommunityIcons name="close" size={15} color={colors.muted} />
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ))}

                  {/* 질문 추가 + AI 버튼 — 같은 행에 자연스럽게 */}
                  <View style={meditStyles.qaFooter}>
                    {qaEntries.length < 5 && (
                      <Pressable
                        style={meditStyles.addPairBtn}
                        onPress={() => setQaEntries(prev => [...prev, { q: '', a: '' }])}
                        hitSlop={8}
                      >
                        <MaterialCommunityIcons name="plus" size={14} color={colors.muted} />
                        <Text style={[meditStyles.addPairText, { color: colors.muted }]}>질문 추가</Text>
                      </Pressable>
                    )}
                    {/* AI 생성 — 오른쪽 끝, 흐르듯 배치 */}
                    <Pressable
                      style={[meditStyles.aiInlineBtn, { opacity: aiLoading ? 0.5 : 1 }]}
                      onPress={isProUser ? generateInModal : () => setShowPaywall(true)}
                      disabled={aiLoading}
                      hitSlop={8}
                    >
                      {aiLoading
                        ? <ActivityIndicator size={12} color={colors.gold} />
                        : <MaterialCommunityIcons
                            name={isProUser ? 'auto-fix' : 'lock-outline'}
                            size={14}
                            color={isProUser ? colors.gold : colors.muted}
                          />
                      }
                      <Text style={[meditStyles.aiInlineText, { color: isProUser ? colors.gold : colors.muted }]}>
                        {aiLoading ? '생성 중' : 'AI 질문'}
                        {!isProUser && ' 🔒'}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Q&A → 기본 전환 링크 */}
                  <Pressable onPress={() => setMeditationMode('basic')} hitSlop={8} style={meditStyles.switchLink}>
                    <Text style={[meditStyles.switchLinkText, { color: colors.muted }]}>← 자유롭게 쓰기</Text>
                  </Pressable>
                </ScrollView>
              ) : (
                /* 기본 모드 */
                <>
                  <TextInput
                    style={[meditStyles.basicInput, { color: colors.text, borderColor: `${colors.border}60` }]}
                    placeholder="오늘 읽은 말씀에서 받은 것..."
                    placeholderTextColor={colors.muted}
                    multiline maxLength={500}
                    value={note} onChangeText={setNote} autoFocus
                  />
                  <View style={meditStyles.basicFooter}>
                    <Text style={[meditStyles.charCount, { color: colors.muted }]}>{note.length}/500</Text>
                    {/* 기본 → Q&A 전환 링크 */}
                    <Pressable onPress={() => setMeditationMode('qa')} hitSlop={8}>
                      <Text style={[meditStyles.switchLinkText, { color: colors.muted }]}>Q&A 형식으로 →</Text>
                    </Pressable>
                  </View>
                </>
              )}

              <View style={styles.modalActions}>
                <Pressable style={[styles.skipBtn, { borderColor: colors.border }]} onPress={() => closeMeditationSheet(() => { if (!meditationVerse) navigateNext(); })}>
                  <Text style={[styles.skipBtnText, { color: colors.muted }]}>건너뛰기</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.saveBtn, { backgroundColor: colors.gold },
                    meditationMode === 'basic' && !note.trim() && styles.saveBtnDisabled,
                    meditationMode === 'qa' && !qaEntries.some(e => e.q.trim() || e.a.trim()) && styles.saveBtnDisabled,
                  ]}
                  onPress={handleSaveMeditation}
                  disabled={meditationMode === 'basic' ? !note.trim() : !qaEntries.some(e => e.q.trim() || e.a.trim())}
                >
                  <Text style={[styles.saveBtnText, { color: '#0B0A12' }]}>저장</Text>
                </Pressable>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Settings sheet */}
        <Modal visible={showSettings} transparent animationType="none">
          <Animated.View style={[styles.backdrop, { opacity: settingsBgOpacity }]} />
          <View style={styles.overlayInner}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={closeSettingsSheet} />
            <Animated.View style={[styles.settingsSheet, { backgroundColor: colors.surface, borderTopColor: colors.border }, { transform: [{ translateY: settingsSheetY }] }]}>
              <View {...settingsPR.panHandlers} style={styles.handleArea}>
                <View style={[styles.modalHandle, { backgroundColor: colors.muted }]} />
              </View>
              <Text style={[styles.settingsTitle, { color: colors.text }]}>읽기 설정</Text>

              <Text style={[styles.settingLabel, { color: colors.muted }]}>화면 테마</Text>
              <View style={styles.themeRow}>
                {(['dark', 'sepia', 'light'] as ReaderTheme[]).map(t => {
                  const tc = READER_THEMES[t];
                  return (
                    <Pressable key={t} style={[styles.themeSwatch, { backgroundColor: tc.bg, borderColor: settings.theme === t ? tc.gold : tc.border }, settings.theme === t && { borderWidth: 2 }]} onPress={() => updateSettings({ theme: t })}>
                      <Text style={[styles.themeSwatchLabel, { color: tc.text }]}>{t === 'dark' ? '다크' : t === 'sepia' ? '세피아' : '라이트'}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.settingLabel, { color: colors.muted }]}>글자 크기</Text>
              <View style={styles.stepperRow}>
                <Pressable style={[styles.stepBtn, { borderColor: colors.border }]} onPress={() => updateSettings({ fontSize: Math.max(14, settings.fontSize - 1) })} hitSlop={8}>
                  <MaterialCommunityIcons name="minus" size={18} color={colors.text} />
                </Pressable>
                <Text style={[styles.stepValue, { color: colors.text }]}>{settings.fontSize}</Text>
                <Pressable style={[styles.stepBtn, { borderColor: colors.border }]} onPress={() => updateSettings({ fontSize: Math.min(22, settings.fontSize + 1) })} hitSlop={8}>
                  <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
                </Pressable>
                <Text style={[styles.stepPreview, { color: colors.text, fontSize: settings.fontSize, fontFamily }]}>미리보기 가나다</Text>
              </View>

              <Text style={[styles.settingLabel, { color: colors.muted }]}>줄 간격</Text>
              <View style={styles.stepperRow}>
                <Pressable style={[styles.stepBtn, { borderColor: colors.border }]} onPress={() => updateSettings({ lineHeight: Math.max(1.4, Math.round((settings.lineHeight - 0.1) * 10) / 10) })} hitSlop={8}>
                  <MaterialCommunityIcons name="minus" size={18} color={colors.text} />
                </Pressable>
                <Text style={[styles.stepValue, { color: colors.text }]}>{settings.lineHeight.toFixed(1)}</Text>
                <Pressable style={[styles.stepBtn, { borderColor: colors.border }]} onPress={() => updateSettings({ lineHeight: Math.min(2.0, Math.round((settings.lineHeight + 0.1) * 10) / 10) })} hitSlop={8}>
                  <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
                </Pressable>
              </View>

              <Text style={[styles.settingLabel, { color: colors.muted }]}>폰트</Text>
              <View style={styles.fontRow}>
                {(['default', 'serif'] as const).map(f => (
                  <Pressable key={f} style={[styles.fontBtn, { borderColor: settings.font === f ? colors.gold : colors.border }, settings.font === f && { backgroundColor: `${colors.gold}20` }]} onPress={() => updateSettings({ font: f })}>
                    <Text style={[styles.fontBtnText, { color: settings.font === f ? colors.gold : colors.muted }, f === 'serif' && { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' }]}>
                      {f === 'default' ? '기본체' : '세리프체'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={[styles.toggleRow, { borderTopColor: colors.border }]}>
                <View style={styles.toggleInfo}>
                  <Text style={[styles.toggleLabel, { color: colors.text }]}>읽기 완료 후 묵상 입력</Text>
                  <Text style={[styles.toggleDesc, { color: colors.muted }]}>끄면 완료 즉시 다음 챕터로 이동</Text>
                </View>
                <Switch value={meditationPromptEnabled} onValueChange={toggleMeditationPrompt} trackColor={{ false: colors.border, true: `${colors.gold}80` }} thumbColor={meditationPromptEnabled ? colors.gold : colors.muted} />
              </View>
            </Animated.View>
          </View>
        </Modal>

        {/* Paywall 바텀시트 */}
        <PaywallSheet
          visible={showPaywall}
          onClose={() => setShowPaywall(false)}
          onPurchase={handlePurchase}
          loading={paywallLoading}
        />

        {/* Feature 2: Meditation markers popup */}
        <Modal visible={meditationPopupVerse !== null} transparent animationType="fade">
          <Pressable style={styles.backdrop} onPress={() => setMeditationPopupVerse(null)} />
          <View style={[meditPopupStyles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={meditPopupStyles.header}>
              <Text style={[meditPopupStyles.headerTitle, { color: colors.text }]}>
                {book?.name} {chapter}:{meditationPopupVerse}절 묵상
              </Text>
              <Pressable onPress={() => setMeditationPopupVerse(null)} hitSlop={12}>
                <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {meditationPopupItems.map((m, i) => {
                let displayNote = m.note;
                try {
                  const parsed = JSON.parse(m.note);
                  if (parsed?.type === 'qa' && Array.isArray(parsed.entries)) {
                    displayNote = parsed.entries.map((e: { q: string; a: string }) => `Q: ${e.q}\nA: ${e.a}`).join('\n\n');
                  }
                } catch {}
                const ref = m.verseStart
                  ? `${book?.name} ${chapter}:${m.verseStart}${m.verseStart !== m.verseEnd ? `–${m.verseEnd}` : ''}`
                  : `${book?.name} ${chapter}장`;
                return (
                  <View key={i} style={[meditPopupStyles.entry, { borderColor: colors.border }]}>
                    <View style={meditPopupStyles.entryMeta}>
                      <Text style={[meditPopupStyles.entryRef, { color: colors.gold }]}>{ref}</Text>
                      <Text style={[meditPopupStyles.entryDate, { color: colors.muted }]}>{formatDate(m.createdAt)}</Text>
                    </View>
                    <Text style={[meditPopupStyles.entryNote, { color: colors.text }]}>{displayNote}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </Modal>

        {/* AI 시트 (묵상 질문 / 구절 해설 / 기도문) */}
        <Modal visible={showAiSheet} transparent animationType="slide">
          <View style={aiStyles.overlay}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowAiSheet(false)} />
            <View style={[aiStyles.sheet, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <View style={aiStyles.handle}>
                <View style={[aiStyles.handleBar, { backgroundColor: colors.muted }]} />
              </View>

              {/* 탭 헤더 */}
              <View style={[aiStyles.tabs, { borderBottomColor: colors.border }]}>
                {([
                  { key: 'meditate', label: '묵상 질문', icon: 'brain' },
                  { key: 'explain',  label: '구절 해설', icon: 'book-open-page-variant' },
                  { key: 'prayer',   label: '기도문',    icon: 'hands-pray' },
                ] as const).map(tab => (
                  <Pressable
                    key={tab.key}
                    style={[aiStyles.tab, aiTab === tab.key && { borderBottomColor: colors.gold, borderBottomWidth: 2 }]}
                    onPress={() => handleAiTabChange(tab.key)}
                  >
                    <MaterialCommunityIcons
                      name={tab.icon}
                      size={14}
                      color={aiTab === tab.key ? colors.gold : colors.muted}
                    />
                    <Text style={[aiStyles.tabLabel, { color: aiTab === tab.key ? colors.gold : colors.muted }]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[aiStyles.ref, { color: colors.gold, marginBottom: 0 }]}>{aiVerseRef}</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  오늘 {Math.max(0, getDailyAILimit(isProUser) - aiDailyRefreshCount)}회 남음
                </Text>
              </View>

              {/* 탭 콘텐츠 */}
              {aiTab === 'meditate' && (
                aiLoading ? (
                  <View style={aiStyles.loading}>
                    <ActivityIndicator color={colors.gold} size="small" />
                    <Text style={[aiStyles.loadingText, { color: colors.muted }]}>묵상 질문 생성 중...</Text>
                  </View>
                ) : aiPrompts ? (
                  <View style={aiStyles.prompts}>
                    {aiPrompts.map((prompt, i) => (
                      <View key={i} style={[aiStyles.promptRow, { borderColor: colors.border }]}>
                        <Text style={[aiStyles.promptNum, { color: colors.gold }]}>{i + 1}</Text>
                        <Text style={[aiStyles.promptText, { color: colors.text }]}>{prompt}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={aiStyles.loading}>
                    <Pressable onPress={() => handleAiTabChange('meditate')} hitSlop={12}>
                      <MaterialCommunityIcons name="brain" size={28} color={colors.gold} style={{ marginBottom: 8, alignSelf: 'center' }} />
                      <Text style={[aiStyles.loadingText, { color: colors.gold, textAlign: 'center' }]}>탭하여 묵상 질문 생성</Text>
                    </Pressable>
                  </View>
                )
              )}

              {aiTab === 'explain' && (
                aiExplainLoading ? (
                  <View style={aiStyles.loading}>
                    <ActivityIndicator color={colors.gold} size="small" />
                    <Text style={[aiStyles.loadingText, { color: colors.muted }]}>구절 해설 생성 중...</Text>
                  </View>
                ) : aiExplanation ? (
                  <ScrollView style={aiStyles.explainScroll} showsVerticalScrollIndicator={false}>
                    {([
                      { label: '역사적 배경', value: aiExplanation.background },
                      { label: '원어 의미',   value: aiExplanation.originalWord },
                      { label: '신학적 핵심', value: aiExplanation.theology },
                    ]).map(({ label, value }) => (
                      <View key={label} style={[aiStyles.explainCard, { borderColor: colors.border }]}>
                        <Text style={[aiStyles.explainLabel, { color: colors.gold }]}>{label}</Text>
                        <Text style={[aiStyles.explainText, { color: colors.text }]}>{value}</Text>
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <View style={aiStyles.loading}>
                    {aiExplainError ? (
                      <>
                        <Text style={[aiStyles.loadingText, { color: '#FF6B6B' }]}>오류: {aiExplainError}</Text>
                        <Pressable onPress={() => { setAiExplainError(null); handleAiTabChange('explain'); }} hitSlop={8}>
                          <Text style={[aiStyles.loadingText, { color: colors.gold, marginTop: 8 }]}>다시 시도</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable onPress={() => handleAiTabChange('explain')} hitSlop={12}>
                        <MaterialCommunityIcons name="book-open-page-variant" size={28} color={colors.gold} style={{ marginBottom: 8, alignSelf: 'center' }} />
                        <Text style={[aiStyles.loadingText, { color: colors.gold, textAlign: 'center' }]}>탭하여 구절 해설 생성</Text>
                      </Pressable>
                    )}
                  </View>
                )
              )}

              {aiTab === 'prayer' && (
                aiPrayerLoading ? (
                  <View style={aiStyles.loading}>
                    <ActivityIndicator color={colors.gold} size="small" />
                    <Text style={[aiStyles.loadingText, { color: colors.muted }]}>기도문 생성 중...</Text>
                  </View>
                ) : aiPrayer ? (
                  <View style={[aiStyles.prayerCard, { borderColor: colors.border }]}>
                    <MaterialCommunityIcons name="hands-pray" size={18} color={colors.gold} style={{ marginBottom: 10 }} />
                    <Text style={[aiStyles.prayerText, { color: colors.text }]}>{aiPrayer}</Text>
                  </View>
                ) : (
                  <View style={aiStyles.loading}>
                    {aiPrayerError ? (
                      <>
                        <Text style={[aiStyles.loadingText, { color: '#FF6B6B' }]}>오류: {aiPrayerError}</Text>
                        <Pressable onPress={() => { setAiPrayerError(null); handleAiTabChange('prayer'); }} hitSlop={8}>
                          <Text style={[aiStyles.loadingText, { color: colors.gold, marginTop: 8 }]}>다시 시도</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable onPress={() => handleAiTabChange('prayer')} hitSlop={12}>
                        <MaterialCommunityIcons name="hands-pray" size={28} color={colors.gold} style={{ marginBottom: 8, alignSelf: 'center' }} />
                        <Text style={[aiStyles.loadingText, { color: colors.gold, textAlign: 'center' }]}>탭하여 기도문 생성</Text>
                      </Pressable>
                    )}
                  </View>
                )
              )}

              {/* 새로고침 버튼 + 카운터 — 결과가 있고 로딩 중 아닐 때 */}
              {((aiTab === 'meditate' && !aiLoading && aiPrompts) ||
                (aiTab === 'explain' && !aiExplainLoading && aiExplanation) ||
                (aiTab === 'prayer' && !aiPrayerLoading && aiPrayer)) && (
                <View style={aiStyles.refreshRow}>
                  <Pressable
                    style={[aiStyles.refreshBtn, aiDailyRefreshCount >= getDailyAILimit(isProUser) && { opacity: 0.4 }]}
                    disabled={aiDailyRefreshCount >= getDailyAILimit(isProUser)}
                    onPress={async () => {
                      const { start, end } = aiVerseRange.current ?? {};
                      const appUserId = await getAppUserId();
                      if (aiTab === 'meditate') {
                        await clearAITypeCache('meditate', bookId, chapter, start, end);
                        setAiPrompts(null);
                        setAiLoading(true);
                        const result = await generateMeditationPrompts(aiSelectedVerses, aiVerseRef, appUserId);
                        if (result.data) {
                          setAiPrompts(result.data.prompts);
                          await setAICache(bookId, chapter, result.data.prompts, start, end);
                          const c = await incrementDailyRefresh();
                          setAiDailyRefreshCount(c);
                        }
                        setAiLoading(false);
                      } else if (aiTab === 'explain') {
                        await clearAITypeCache('explain', bookId, chapter, start, end);
                        setAiExplanation(null);
                        setAiExplainLoading(true);
                        const result = await generateExplanation(aiSelectedVerses, aiVerseRef, appUserId);
                        setAiExplainLoading(false);
                        if (result.data) {
                          setAiExplanation(result.data);
                          await setAITypeCache('explain', bookId, chapter, result.data, start, end);
                          const c = await incrementDailyRefresh();
                          setAiDailyRefreshCount(c);
                        }
                      } else if (aiTab === 'prayer') {
                        await clearAITypeCache('prayer', bookId, chapter, start, end);
                        setAiPrayer(null);
                        setAiPrayerLoading(true);
                        const result = await generatePrayer(aiSelectedVerses, aiVerseRef, appUserId);
                        setAiPrayerLoading(false);
                        if (result.data) {
                          setAiPrayer(result.data);
                          await setAITypeCache('prayer', bookId, chapter, result.data, start, end);
                          const c = await incrementDailyRefresh();
                          setAiDailyRefreshCount(c);
                        }
                      }
                    }}
                  >
                    <MaterialCommunityIcons name="refresh" size={13} color={colors.muted} />
                    <Text style={[aiStyles.refreshText, { color: colors.muted }]}>재조회</Text>
                  </Pressable>
                  <Text style={[aiStyles.refreshCount, { color: colors.muted }]}>
                    오늘 {getDailyAILimit(isProUser) - aiDailyRefreshCount}회 남음
                  </Text>
                </View>
              )}

              {/* 묵상 기록 버튼 — 묵상 질문 탭에서만 */}
              {aiTab === 'meditate' && !aiLoading && aiPrompts && (
                <Pressable
                  style={[aiStyles.writeBtn, { backgroundColor: colors.gold }]}
                  onPress={() => {
                    setShowAiSheet(false);
                    setMeditationVerse(null);
                    if (isProUser && aiPrompts.length > 0) {
                      setMeditationMode('qa');
                      setQaEntries(aiPrompts.map(q => ({ q, a: '' })));
                      setNote('');
                    } else {
                      setMeditationMode('basic');
                      setNote(`[AI 질문] ${aiPrompts[0]}\n\n`);
                    }
                    openMeditationSheet();
                  }}
                >
                  <Text style={[aiStyles.writeBtnText, { color: colors.bg }]}>묵상 기록하기</Text>
                </Pressable>
              )}
            </View>
          </View>
        </Modal>
        {/* Feature 1: Reading tutorial */}
        {tutorialActive && (
          <ReadingTutorial
            step={tutorialStep}
            overlayOpacity={tutorialOpacity}
            onNext={tutorialAdvance}
            onDismiss={tutorialDismiss}
          />
        )}
      </View>
    </>
  );
}

const aiStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 40,
    borderTopWidth: 1,
  },
  handle: { alignItems: 'center', paddingVertical: 12 },
  handleBar: { width: 40, height: 4, borderRadius: 2 },
  // Tab bar
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 10, marginBottom: -StyleSheet.hairlineWidth,
  },
  tabLabel: { fontSize: 12, fontWeight: '600' },
  ref: { fontSize: 12, marginBottom: 12 },
  loading: { paddingVertical: 24, alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 13 },
  // Meditate tab
  prompts: { gap: 10, marginBottom: 20 },
  promptRow: {
    flexDirection: 'row', gap: 12,
    borderWidth: 1, borderRadius: 12, padding: 14,
  },
  promptNum: { fontSize: 16, fontWeight: '700', width: 20, lineHeight: 22 },
  promptText: { flex: 1, fontSize: 14, lineHeight: 21 },
  // Explain tab
  explainScroll: { maxHeight: 280, marginBottom: 12 },
  explainCard: {
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10,
  },
  explainLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  explainText: { fontSize: 14, lineHeight: 21 },
  // Prayer tab
  prayerCard: {
    borderWidth: 1, borderRadius: 14, padding: 18,
    alignItems: 'center', marginBottom: 16,
  },
  prayerText: { fontSize: 14, lineHeight: 23, textAlign: 'center' },
  // CTA
  writeBtn: { paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  writeBtnText: { fontSize: 15, fontWeight: '700' },
  // 재조회
  refreshRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 8 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  refreshText: { fontSize: 12 },
  refreshCount: { fontSize: 11 },
});

const meditStyles = StyleSheet.create({
  // ── 시트 헤더 ─────────────────────────────────────────
  sheetHeader: {
    flexDirection: 'row', alignItems: 'baseline',
    gap: 8, marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetRef: { fontSize: 13 },

  // ── Q&A 모드 ──────────────────────────────────────────
  qaScrollView: { flexGrow: 0, marginBottom: 8 },
  qaEntry: { marginBottom: 14 },
  qaRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  qaNum: { fontSize: 13, fontWeight: '700', width: 16, lineHeight: 22 },
  qaInputCol: { flex: 1 },
  qaQ: { fontSize: 15, lineHeight: 22, paddingVertical: 0, minHeight: 22 },
  qaDiv: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  qaA: { fontSize: 14, lineHeight: 21, paddingVertical: 0, minHeight: 44, opacity: 0.85 },

  // Q&A 하단 액션줄
  qaFooter: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  addPairBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addPairText: { fontSize: 12 },
  aiInlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiInlineText: { fontSize: 12, fontWeight: '600' },

  // ── 기본 모드 ─────────────────────────────────────────
  basicInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12, padding: 14,
    fontSize: 16, lineHeight: 24,
    minHeight: 100, textAlignVertical: 'top',
    marginBottom: 6,
  },
  basicFooter: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 4,
  },
  charCount: { fontSize: 11 },

  // ── 모드 전환 링크 (공통) ────────────────────────────
  switchLink: { alignSelf: 'flex-start', marginBottom: 6 },
  switchLinkText: { fontSize: 12 },

  // ── 하단 내비 ─────────────────────────────────────────
  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomNavBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 8, paddingHorizontal: 4 },
  bottomNavText: { fontSize: 14 },
  bottomNavChapter: { fontSize: 13 },
});


const meditPopupStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    maxHeight: '60%',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    paddingHorizontal: 20, paddingBottom: 32, paddingTop: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, marginBottom: 4,
  },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  entry: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  entryMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  entryRef: { fontSize: 12, fontWeight: '600' },
  entryDate: { fontSize: 11 },
  entryNote: { fontSize: 14, lineHeight: 21 },
});

const milestoneStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  card: {
    width: '82%',
    borderRadius: 28,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  flame: { fontSize: 64, marginBottom: 4 },
  count: { fontSize: 56, fontWeight: '900', lineHeight: 64 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  desc: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 12 },
  btn: {
    paddingVertical: 16, paddingHorizontal: 40,
    borderRadius: 14, marginTop: 8,
  },
  btnText: { fontSize: 16, fontWeight: '700' },
});

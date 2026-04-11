import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFonts } from 'expo-font';
import { NanumMyeongjo_400Regular } from '@expo-google-fonts/nanum-myeongjo';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useBibleText } from '../../../hooks/useBibleText';
import { useReaderSettings, MARGIN_MAP } from '../../../hooks/useReaderSettings';
import ReaderSettingsSheet from '../../../components/ReaderSettingsSheet';
import { useTTS } from '../../../hooks/useTTS';
import { TTSMiniPlayer } from '../../../components/TTSMiniPlayer';
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
import PaywallSheet from '../../../components/PaywallSheet';

// ── Rich text parser for AI explanation ────────────────────────────────────
type RichSegment = { text: string; type: 'normal' | 'ref' | 'quote' };

function parseRichText(text: string): RichSegment[] {
  // Match: (...) 괄호 부연, '인용', 「인용」, "인용"
  const pattern = /(\([^)]+\))|('[^']+')|(「[^」]+」)|("[^"]+")/g;
  const segments: RichSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), type: 'normal' });
    }
    if (match[1]) {
      segments.push({ text: match[1], type: 'ref' });
    } else {
      segments.push({ text: match[0], type: 'quote' });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), type: 'normal' });
  }
  return segments;
}

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
  const { bookId: bookIdStr, chapter: chapterStr, verse: verseStr, ttsAutoStart } = useLocalSearchParams<{
    bookId: string; chapter: string; verse?: string; ttsAutoStart?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const bookId = Number(bookIdStr);
  const chapter = Number(chapterStr);
  const book = BOOKS.find(b => b.id === bookId);

  const { verses, loading, error } = useBibleText(bookId, chapter);
  const { settings, update: updateSettings, colors } = useReaderSettings();
  const { height: windowHeight } = useWindowDimensions();

  // ── State ─────────────────────────────────────────────────────────────────
  const [highlightVerse, setHighlightVerse] = useState<number | null>(null);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const alreadyDoneRef = useRef(false); // stale closure 방지용 ref
  const ttsAutoStartedRef = useRef(false); // auto-start 중복 방지
  const [readVerses, setReadVerses] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [meditationPromptEnabled, setMeditationPromptEnabled] = useState(true);
  const [centerVerseIndex, setCenterVerseIndex] = useState<number | null>(null);
  const lastViewableItemsRef = useRef<Array<{ index: number | null }>>([]);
  const viewabilityConfigCallbackPairs = useRef([{
    viewabilityConfig: { itemVisiblePercentThreshold: 50 },
    onViewableItemsChanged: ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      lastViewableItemsRef.current = viewableItems;
      // 헤더 높이 애니메이션 중에는 레이아웃 변화로 인한 오탐 방지
      if (headerTransitioningRef.current) return;
      if (viewableItems.length === 0) return;
      // 헤더 숨김 시 맨 위 절은 노치에 가려질 수 있으므로 세 번째 절을 포커스
      const offset = headerVisibleRef.current ? 0 : 2;
      const target = viewableItems[offset] ?? viewableItems[0];
      if (target?.index != null) setCenterVerseIndex(target.index);
    },
  }]);
  const [aiPrompts, setAiPrompts] = useState<string[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [aiSheetExpanded, setAiSheetExpanded] = useState(false);
  // aiSheetPanY: useNativeDriver: false — _value 동기 읽기로 제스처 offset 계산
  const aiSheetPanY = useRef(new Animated.Value(0)).current;
  const aiSheetDragBase = useRef(0);
  const closeAiSheet = useRef(() => {});
  closeAiSheet.current = () => {
    Animated.timing(aiSheetPanY, { toValue: 600, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: false })
      .start(() => { setShowAiSheet(false); setAiSheetExpanded(false); });
  };
  const aiSheetPR = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
    onPanResponderGrant: () => {
      aiSheetDragBase.current = (aiSheetPanY as any)._value ?? 0;
    },
    onPanResponderMove: (_, gs) => {
      const newY = aiSheetDragBase.current + gs.dy;
      if (newY > 0) aiSheetPanY.setValue(newY);
    },
    onPanResponderRelease: (_, gs) => {
      const finalY = aiSheetDragBase.current + gs.dy;
      if (finalY > 100 || gs.vy > 0.5) {
        closeAiSheet.current();
      } else if (gs.dy < -50) {
        setAiSheetExpanded(true);
        Animated.spring(aiSheetPanY, { toValue: 0, friction: 20, tension: 100, overshootClamping: true, useNativeDriver: false }).start();
      } else {
        Animated.spring(aiSheetPanY, { toValue: 0, friction: 20, tension: 100, overshootClamping: true, useNativeDriver: false }).start();
      }
    },
  })).current;
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

  // Mini toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastOpacity.setValue(0);
    Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setToastMsg(null));
    }, 1800);
  }

  const flatListRef = useRef<FlatList>(null);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const HEADER_FULL_H = insets.top + HEADER_H + PROGRESS_H;

  function navigateNext() {
    const next = nextAfter(bookId, chapter);
    router.replace(`/read/${next.bookId}/${next.chapter}`);
  }

  const {
    isTTS, isPaused, ttsVerse, ttsRateIdx, noKoreanVoice,
    availableVoices, selectedVoiceId,
    timerMinutes, timerRemaining,
    autoCompleteEnabled, autoAdvanceEnabled, pauseEnabled, verseReadEnabled, settingsLoaded,
    startTTS, startFromVerse, toggleTTS, stopTTS, togglePause, skipVerse,
    selectTTSRate, selectVoice,
    startTimer, cancelTimer,
    toggleAutoComplete, toggleAutoAdvance, togglePauseEnabled, toggleVerseRead,
  } = useTTS(verses, {
    onChapterEnd: () => {
      if (alreadyDoneRef.current) return;
      handleCompleteSilent();
    },
    onAutoAdvance: () => {
      const next = nextAfter(bookId, chapter);
      router.replace(`/read/${next.bookId}/${next.chapter}?ttsAutoStart=1` as any);
    },
    onVerseRead: (verseNumber: number) => {
      markVerseRead(bookId, chapter, verseNumber);
      setReadVerses(prev => new Set([...prev, verseNumber]));
    },
  });

  const { headerOpacity, headerHeightValue, bottomNavOpacity, headerTransitioningRef, headerVisibleRef, afterAnimRef, handleScroll } = useHeaderAnim(HEADER_FULL_H);
  // 헤더 애니메이션 완료 후 집중 모드 포커스 재계산 (stale 방지)
  afterAnimRef.current = (headerVisible: boolean) => {
    if (!settings.focusMode || !isProUser) return;
    const items = lastViewableItemsRef.current;
    if (items.length === 0) return;
    const offset = headerVisible ? 0 : 2;
    const target = items[offset] ?? items[0];
    if (target?.index != null) setCenterVerseIndex(target.index);
  };

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
    openSettingsSheet, closeSettingsSheet,
  } = useSettingsSheet();

  const { showConfetti, particles, fireConfetti } = useConfetti();

  // Feature 4: Badge toast (global context — persists across navigation)
  const showBadgeToast = useShowBadgeToast();
  // AI 선택 구절 범위 (새로고침용)
  const aiVerseRange = useRef<{ start: number; end: number } | null>(null);

  // Feature 1: Tutorial — redirect to dedicated mock screen on first visit
  useEffect(() => {
    getSetting('tutorial_reading_complete', '0').then(val => {
      if (val === '0') {
        router.replace({
          pathname: '/tutorial-read',
          params: { bookId, chapter },
        });
      }
    });
  }, []);

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

  // Scroll to specific verse (from search/meditation link)
  const targetVerse = verseStr ? Number(verseStr) : null;
  const didAutoScroll = useRef(false);
  useEffect(() => {
    if (didAutoScroll.current) return;
    if (!verses || verses.length === 0) return;

    // verse 파라미터가 있으면 해당 절로 스크롤 + 하이라이트 (검색/묵상에서 이동)
    if (targetVerse) {
      const idx = verses.findIndex(v => v.verse === targetVerse);
      if (idx >= 0) {
        didAutoScroll.current = true;
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: idx, animated: true, viewOffset: HEADER_FULL_H + 12,
          });
          // 스크롤 후 잠시 빛나기
          setTimeout(() => {
            setHighlightVerse(targetVerse);
            setTimeout(() => setHighlightVerse(null), 1500);
          }, 400);
        }, 300);
        return;
      }
    }

    // 기본: 첫 번째 안 읽은 절로 스크롤
    if (readVerses.size === 0 || readVerses.size >= verses.length) return;
    didAutoScroll.current = true;
    const firstUnreadIndex = verses.findIndex(v => !readVerses.has(v.verse));
    if (firstUnreadIndex > 2) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: firstUnreadIndex, animated: true, viewOffset: 20,
        });
      }, 300);
    }
  }, [verses, readVerses.size, targetVerse]);

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
      // 이미 선택된 범위 안의 절을 다시 탭하면 해당 절 제거
      if (selectionRange && verseNum >= selectionRange.start && verseNum <= selectionRange.end) {
        if (selectionRange.start === selectionRange.end) {
          // 단일 절 → 전체 해제
          cancelSelection();
        } else if (verseNum === selectionRange.start) {
          setSelectionRange({ start: selectionRange.start + 1, end: selectionRange.end });
        } else if (verseNum === selectionRange.end) {
          setSelectionRange({ start: selectionRange.start, end: selectionRange.end - 1 });
        } else {
          // 중간 절 → 전체 해제 (연속 범위 유지 불가)
          cancelSelection();
        }
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
    setAiSheetExpanded(false);
    aiSheetDragBase.current = 0;
    aiSheetPanY.setValue(600);
    setShowAiSheet(true);
    Animated.spring(aiSheetPanY, { toValue: 0, friction: 9, tension: 100, useNativeDriver: false }).start();
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

  // alreadyDoneRef 동기화 (TTS 콜백 stale closure 방지)
  useEffect(() => { alreadyDoneRef.current = alreadyDone; }, [alreadyDone]);

  // TTS auto-start: 다음 장으로 이동 후 자동 시작 (?ttsAutoStart=1)
  // settingsLoaded를 체크해야 ttsRateIdxRef가 DB에서 복원된 후 startTTS() 호출 가능
  useEffect(() => {
    if (ttsAutoStart === '1' && verses && verses.length > 0 && !ttsAutoStartedRef.current && settingsLoaded) {
      ttsAutoStartedRef.current = true;
      startTTS();
    }
  }, [ttsAutoStart, verses, settingsLoaded]);

  // ── Chapter complete ───────────────────────────────────────────────────────
  const STREAK_MILESTONES = [5, 30, 100];

  // TTS 완료 시 호출 — 묵상 시트 없이 조용히 완료 처리
  async function handleCompleteSilent() {
    if (alreadyDoneRef.current) return;
    alreadyDoneRef.current = true;
    await markChapterComplete(bookId, chapter);
    setAlreadyDone(true);
    if (verses && verses.length > 0) {
      const allNums = verses.map(v => v.verse);
      await Promise.all(allNums.map(v => markVerseRead(bookId, chapter, v)));
      setReadVerses(new Set(allNums));
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    checkAndShowNewBadges();
  }

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
    try {
      if (meditationMode === 'qa') {
        const validEntries = qaEntries.filter(e => e.q.trim() || e.a.trim());
        if (validEntries.length > 0) {
          const noteToSave = JSON.stringify({ type: 'qa', entries: validEntries });
          await saveMeditation(bookId, chapter, noteToSave, meditationVerse?.start, meditationVerse?.end);
        }
      } else if (note.trim()) {
        await saveMeditation(bookId, chapter, note.trim(), meditationVerse?.start, meditationVerse?.end);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('묵상이 저장되었습니다');
      // Feature 2: reload meditation markers
      getMeditationsForChapter(bookId, chapter).then(setChapterMeditations);
      closeMeditationSheet(() => { if (wasChapter) navigateNext(); });
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast('저장에 실패했습니다');
    }
  }

  async function toggleMeditationPrompt(val: boolean) {
    setMeditationPromptEnabled(val);
    await setSetting('meditation_prompt_enabled', val ? '1' : '0');
  }

  // keepAwake: 설정 변경 및 화면 진입/이탈 시 활성화/비활성화
  useEffect(() => {
    if (settings.keepAwake) {
      activateKeepAwakeAsync();
    } else {
      deactivateKeepAwake();
    }
    return () => { deactivateKeepAwake(); };
  }, [settings.keepAwake]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const title = book ? `${book.name} ${chapter}장` : `${bookId}:${chapter}`;
  const totalVerses = verses?.length ?? 0;
  const readCount = readVerses.size;
  const progressPct = totalVerses > 0 ? readCount / totalVerses : 0;
  const [fontsLoaded] = useFonts({ NanumMyeongjo_400Regular });
  const FONT_FAMILY_MAP: Record<string, string | undefined> = {
    default: undefined,
    serif: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    nanumMyeongjo: fontsLoaded ? 'NanumMyeongjo_400Regular' : undefined,
    nanumGothic: undefined,
    nanumSquareRound: undefined,
  };
  const fontFamily = FONT_FAMILY_MAP[settings.font];
  const verseLabel = selectionRange
    ? `${book?.name} ${chapter}:${selectionRange.start}${selectionRange.start !== selectionRange.end ? `–${selectionRange.end}` : ''} 선택됨`
    : '';

  // ── Render verse row ──────────────────────────────────────────────────────
  const renderVerse = useCallback(({ item, index }: { item: { verse: number; text: string }; index: number }) => {
    const isRead = readVerses.has(item.verse);
    const inSelection = selectionMode && selectionRange
      && item.verse >= selectionRange.start && item.verse <= selectionRange.end;
    const isTTSActive = isTTS && ttsVerse === item.verse;
    const hasMeditation = showMeditationMarkers && getVerseMeditations(item.verse).length > 0;
    const isHighlighted = highlightVerse === item.verse;
    const isFocused = settings.focusMode && isProUser
      ? centerVerseIndex === index
      : true;

    return (
      <Pressable
        onPress={() => handleVerseTap(item.verse)}
        onLongPress={() => handleVerseLongPress(item.verse)}
        delayLongPress={400}
        style={[
          styles.verseRow,
          { borderWidth: 1.5, borderColor: 'transparent', borderRadius: 8 },
          inSelection && { backgroundColor: `${colors.gold}20` },
          isTTSActive && { backgroundColor: `${colors.gold}30`, borderColor: `${colors.gold}60` },
          isHighlighted && {
            borderColor: colors.gold,
            shadowColor: colors.gold,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 8,
            elevation: 6,
          },
          !isFocused && { opacity: 0.35 },
        ]}
      >
        {!settings.hideVerseNumbers && (
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
        )}
        <Text style={[
          styles.verseText,
          { color: colors.text, fontSize: settings.fontSize, lineHeight: settings.fontSize * settings.lineHeight, fontFamily, letterSpacing: settings.letterSpacing },
          isRead && { opacity: 0.45 },
        ]}>
          {item.text}
        </Text>
      </Pressable>
    );
  }, [readVerses, selectionMode, selectionRange, isTTS, ttsVerse, settings, colors, fontFamily, chapterMeditations, showMeditationMarkers, highlightVerse, centerVerseIndex, isProUser]);

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
              <Pressable
                onPress={() => {
                  if (!isProUser && !isTTS && !isPaused) {
                    setShowPaywall(true);
                    return;
                  }
                  if (noKoreanVoice && !isTTS && !isPaused) {
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
                <MaterialCommunityIcons
                  name={(isTTS || isPaused) ? 'volume-high' : 'volume-off'}
                  size={20}
                  color={(isTTS || isPaused) ? colors.gold : colors.muted}
                />
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
            contentContainerStyle={[
              styles.list,
              { paddingHorizontal: MARGIN_MAP[settings.horizontalMargin] },
              settings.focusMode && isProUser && { paddingBottom: windowHeight * 0.8 },
            ]}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onScrollToIndexFailed={() => {}}
            renderItem={renderVerse}
            viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
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

        {/* 하단 네비게이션 / TTS 미니 플레이어 */}
        {!selectionMode && (
          (isTTS || isPaused) ? (
            <TTSMiniPlayer
              isTTS={isTTS}
              isPaused={isPaused}
              currentVerseText={verses?.find(v => v.verse === ttsVerse)?.text ?? null}
              ttsRateIdx={ttsRateIdx}
              availableVoices={availableVoices}
              selectedVoiceId={selectedVoiceId}
              timerMinutes={timerMinutes}
              timerRemaining={timerRemaining}
              autoCompleteEnabled={autoCompleteEnabled}
              autoAdvanceEnabled={autoAdvanceEnabled}
              pauseEnabled={pauseEnabled}
              verseReadEnabled={verseReadEnabled}
              colors={colors}
              paddingBottom={insets.bottom + 4}
              onStop={stopTTS}
              onTogglePause={togglePause}
              onSkip={skipVerse}
              onSelectRate={selectTTSRate}
              onSelectVoice={selectVoice}
              onStartTimer={startTimer}
              onCancelTimer={cancelTimer}
              onToggleAutoComplete={toggleAutoComplete}
              onToggleAutoAdvance={toggleAutoAdvance}
              onTogglePauseEnabled={togglePauseEnabled}
              onToggleVerseRead={toggleVerseRead}
            />
          ) : (
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
          )
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
              <Pressable
                style={[styles.selBtn, { borderWidth: 1, borderColor: colors.border }]}
                onPress={() => {
                  if (!selectionRange) return;
                  const verseNum = selectionRange.start;
                  cancelSelection();
                  startFromVerse(verseNum);
                }}
              >
                <MaterialCommunityIcons name="play-circle-outline" size={15} color={colors.text} />
                <Text style={[styles.selBtnText, { color: colors.text }]}>TTS</Text>
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
        <ReaderSettingsSheet
          visible={showSettings}
          onClose={closeSettingsSheet}
          settings={settings}
          colors={colors}
          onUpdate={updateSettings}
          fontsLoaded={fontsLoaded ?? false}
          meditationPromptEnabled={meditationPromptEnabled}
          onToggleMeditationPrompt={toggleMeditationPrompt}
          isPro={isProUser}
          onUpgrade={() => { closeSettingsSheet(); setShowPaywall(true); }}
        />

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
        <Modal visible={showAiSheet} transparent animationType="none">
          <View style={aiStyles.overlay}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => closeAiSheet.current()} />
            <Animated.View style={[
              aiStyles.sheet,
              { backgroundColor: colors.surface, borderTopColor: colors.border },
              { maxHeight: aiSheetExpanded ? '90%' : '62%' },
              { transform: [{ translateY: aiSheetPanY }] },
            ]}>
              <View {...aiSheetPR.panHandlers} style={aiStyles.handle}>
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
                      { label: '역사적 배경', value: aiExplanation.background, icon: 'map-marker-outline' as const },
                      { label: '원어 의미',   value: aiExplanation.originalWord, icon: 'translate' as const },
                      { label: '신학적 핵심', value: aiExplanation.theology, icon: 'cross' as const },
                    ]).map(({ label, value, icon }) => (
                      <View key={label} style={[aiStyles.explainCard, { borderColor: colors.border }]}>
                        <View style={aiStyles.explainHeader}>
                          <View style={[aiStyles.explainIconWrap, { backgroundColor: `${colors.gold}15` }]}>
                            <MaterialCommunityIcons name={icon} size={14} color={colors.gold} />
                          </View>
                          <Text style={[aiStyles.explainLabel, { color: colors.gold }]}>{label}</Text>
                        </View>
                        <Text style={[aiStyles.explainText, { color: colors.text }]}>
                          {parseRichText(value).map((seg, si) =>
                            seg.type === 'ref'
                              ? <Text key={si} style={aiStyles.explainRef}>{seg.text}</Text>
                              : seg.type === 'quote'
                                ? <Text key={si} style={[aiStyles.explainQuote, { color: colors.gold }]}>{seg.text}</Text>
                                : seg.text
                          )}
                        </Text>
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
                    setMeditationVerse(aiVerseRange.current ?? null);
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
            </Animated.View>
          </View>
        </Modal>
        {/* Mini toast */}
        {toastMsg && (
          <Animated.View style={[toastStyles.wrap, { opacity: toastOpacity, bottom: insets.bottom + 60 }]}>
            <View style={[toastStyles.inner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[toastStyles.text, { color: colors.text }]}>{toastMsg}</Text>
            </View>
          </Animated.View>
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
  handle: { alignItems: 'center', paddingVertical: 20 },
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
  explainScroll: { maxHeight: 360, marginBottom: 12 },
  explainCard: {
    borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12,
  },
  explainHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
  },
  explainIconWrap: {
    width: 26, height: 26, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  explainLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  explainText: { fontSize: 15, lineHeight: 24 },
  explainRef: { fontSize: 13, color: 'rgba(255,255,255,0.4)' },
  explainQuote: { fontWeight: '600' },
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

const toastStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0, right: 0,
    alignItems: 'center',
    zIndex: 600,
  },
  inner: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  text: { fontSize: 13, fontWeight: '600' },
});

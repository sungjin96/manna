import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import { useMeditationSheet } from '../../../hooks/useMeditationSheet';
import { useSettingsSheet } from '../../../hooks/useSettingsSheet';
import { useConfetti } from '../../../hooks/useConfetti';
import {
  markChapterComplete, isChapterComplete,
  markVerseRead, unmarkVerseRead, getReadVerses,
} from '../../../db/readings';
import { saveMeditation } from '../../../db/meditations';
import { getSetting, setSetting } from '../../../db/settings';
import { getAICache, setAICache } from '../../../db/ai_cache';
import { generateMeditationPrompts, aiErrorMessage } from '../../../utils/ai-meditation';
import { BOOKS } from '../../../constants/books';
import { styles, HEADER_H, PROGRESS_H } from './chapter.styles';

// ── Helper ─────────────────────────────────────────────────────────────────
function nextAfter(bookId: number, chapter: number): { bookId: number; chapter: number } {
  const book = BOOKS.find(b => b.id === bookId);
  if (!book) return { bookId: 1, chapter: 1 };
  if (chapter < book.chapters) return { bookId, chapter: chapter + 1 };
  const nextBook = BOOKS.find(b => b.id === bookId + 1);
  return nextBook ? { bookId: nextBook.id, chapter: 1 } : { bookId: 1, chapter: 1 };
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

  const flatListRef = useRef<FlatList>(null);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const HEADER_FULL_H = insets.top + HEADER_H + PROGRESS_H;

  function navigateNext() {
    const next = nextAfter(bookId, chapter);
    router.replace(`/read/${next.bookId}/${next.chapter}`);
  }

  const {
    isTTS, ttsVerse, ttsRateIdx, showTTSMenu, noKoreanVoice, setShowTTSMenu,
    toggleTTS, selectTTSRate,
  } = useTTS(verses);

  const { headerOpacity, headerHeightValue, handleScroll } = useHeaderAnim(HEADER_FULL_H);

  const {
    showMeditation, meditationVerse, setMeditationVerse,
    note, setNote,
    meditationSheetY, meditationBgOpacity, meditationPR,
    openMeditationSheet, closeMeditationSheet,
  } = useMeditationSheet(navigateNext);

  const {
    showSettings,
    settingsSheetY, settingsBgOpacity, settingsPR,
    openSettingsSheet, closeSettingsSheet,
  } = useSettingsSheet();

  const { showConfetti, particles, fireConfetti } = useConfetti();

  // ── Initial data load ─────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      isChapterComplete(bookId, chapter),
      getReadVerses(bookId, chapter),
      getSetting('meditation_prompt_enabled', '1'),
    ]).then(([done, rv, promptSetting]) => {
      setAlreadyDone(done);
      setReadVerses(rv);
      setMeditationPromptEnabled(promptSetting === '1');
    });
  }, [bookId, chapter]);

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

  // ── Verse interactions ────────────────────────────────────────────────────
  async function handleVerseTap(verseNum: number) {
    if (selectionMode) {
      setSelectionRange(prev => {
        if (!prev) return { start: verseNum, end: verseNum };
        return { start: Math.min(prev.start, verseNum), end: Math.max(prev.end, verseNum) };
      });
      return;
    }
    if (readVerses.has(verseNum)) {
      await unmarkVerseRead(bookId, chapter, verseNum);
      setReadVerses(prev => { const next = new Set(prev); next.delete(verseNum); return next; });
    } else {
      await markVerseRead(bookId, chapter, verseNum);
      setReadVerses(prev => new Set([...prev, verseNum]));
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
    cancelSelection();
    setShowAiSheet(true);
    setAiPrompts(null);
    setAiLoading(true);

    // Check cache first
    const cached = await getAICache(bookId, chapter, selectionRange.start, selectionRange.end);
    if (cached) {
      setAiPrompts(cached);
      setAiLoading(false);
      return;
    }

    const apiKey = await getSetting('claude_api_key', '');
    const result = await generateMeditationPrompts(selected, ref, apiKey);

    if (result.data) {
      setAiPrompts(result.data.prompts);
      await setAICache(bookId, chapter, result.data.prompts, selectionRange.start, selectionRange.end);
    } else {
      setAiPrompts([aiErrorMessage(result.error!)]);
    }
    setAiLoading(false);
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
  async function handleComplete() {
    if (alreadyDone || selectionMode) return;
    fireConfetti();
    await markChapterComplete(bookId, chapter);
    setAlreadyDone(true);
    if (meditationPromptEnabled) {
      setTimeout(() => { setMeditationVerse(null); setNote(''); openMeditationSheet(); }, 400);
    } else {
      setTimeout(() => navigateNext(), 400);
    }
  }

  async function handleSaveMeditation() {
    if (note.trim()) {
      await saveMeditation(bookId, chapter, note.trim(), meditationVerse?.start, meditationVerse?.end);
    }
    const wasChapter = meditationVerse === null;
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
        <Text style={[styles.verseNum, { color: colors.gold, fontFamily }, isRead && { opacity: 0.35 }]}>
          {item.verse}
        </Text>
        <Text style={[
          styles.verseText,
          { color: colors.text, fontSize: settings.fontSize, lineHeight: settings.fontSize * settings.lineHeight, fontFamily },
          isRead && { opacity: 0.45 },
        ]}>
          {item.text}
        </Text>
      </Pressable>
    );
  }, [readVerses, selectionMode, selectionRange, isTTS, ttsVerse, settings, colors, fontFamily]);

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

        {/* TTS speed dropdown */}
        {showTTSMenu && (
          <>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowTTSMenu(false)} />
            <View style={[styles.ttsMenu, { backgroundColor: colors.surface, borderColor: colors.border, top: insets.top + HEADER_H - 4 }]}>
              {TTS_RATE_LABELS.map((label, idx) => (
                <Pressable key={idx} style={[styles.ttsMenuItem, idx === ttsRateIdx && { backgroundColor: `${colors.gold}18` }]} onPress={() => selectTTSRate(idx)}>
                  <Text style={[styles.ttsMenuLabel, { color: idx === ttsRateIdx ? colors.gold : colors.text }]}>{label}</Text>
                  {idx === ttsRateIdx && <MaterialCommunityIcons name="check" size={14} color={colors.gold} />}
                </Pressable>
              ))}
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
                style={({ pressed }) => [styles.completeBtn, alreadyDone && styles.doneBtnDisabled, pressed && !alreadyDone && styles.completeBtnPressed]}
                onPress={handleComplete}
                disabled={alreadyDone}
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
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => closeMeditationSheet(() => { if (!meditationVerse) navigateNext(); })} />
            <Animated.View style={[styles.modal, { backgroundColor: colors.surface, borderTopColor: colors.border }, { transform: [{ translateY: meditationSheetY }] }]}>
              <View {...meditationPR.panHandlers} style={styles.handleArea}>
                <View style={[styles.modalHandle, { backgroundColor: colors.muted }]} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>오늘의 묵상</Text>
              <Text style={[styles.modalSub, { color: colors.gold }]}>
                {meditationVerse
                  ? `${book?.name} ${chapter}:${meditationVerse.start}${meditationVerse.start !== meditationVerse.end ? `–${meditationVerse.end}` : ''}`
                  : `${book?.name} ${chapter}장 — 한 줄이라도 남겨보세요 (선택)`}
              </Text>
              <TextInput
                style={[styles.textInput, { color: colors.text, backgroundColor: colors.bg, borderColor: colors.border }]}
                placeholder="오늘 읽은 말씀에서 받은 것..."
                placeholderTextColor={colors.muted}
                multiline maxLength={200}
                value={note} onChangeText={setNote} autoFocus
              />
              <Text style={[styles.charCount, { color: colors.muted }]}>{note.length}/200</Text>
              <View style={styles.modalActions}>
                <Pressable style={[styles.skipBtn, { borderColor: colors.border }]} onPress={() => closeMeditationSheet(() => { if (!meditationVerse) navigateNext(); })}>
                  <Text style={[styles.skipBtnText, { color: colors.muted }]}>건너뛰기</Text>
                </Pressable>
                <Pressable style={[styles.saveBtn, { backgroundColor: colors.gold }, !note.trim() && styles.saveBtnDisabled]} onPress={handleSaveMeditation} disabled={!note.trim()}>
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

        {/* AI 묵상 시트 */}
        <Modal visible={showAiSheet} transparent animationType="slide">
          <View style={aiStyles.overlay}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowAiSheet(false)} />
            <View style={[aiStyles.sheet, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <View style={aiStyles.handle}>
                <View style={[aiStyles.handleBar, { backgroundColor: colors.muted }]} />
              </View>
              <View style={aiStyles.header}>
                <MaterialCommunityIcons name="robot-outline" size={20} color={colors.gold} />
                <Text style={[aiStyles.title, { color: colors.text }]}>AI 묵상 질문</Text>
              </View>
              <Text style={[aiStyles.ref, { color: colors.gold }]}>{aiVerseRef}</Text>

              {aiLoading ? (
                <View style={aiStyles.loading}>
                  <Text style={[aiStyles.loadingText, { color: colors.muted }]}>묵상 질문을 생성하는 중...</Text>
                </View>
              ) : (
                <View style={aiStyles.prompts}>
                  {aiPrompts?.map((prompt, i) => (
                    <View key={i} style={[aiStyles.promptRow, { borderColor: colors.border }]}>
                      <Text style={[aiStyles.promptNum, { color: colors.gold }]}>{i + 1}</Text>
                      <Text style={[aiStyles.promptText, { color: colors.text }]}>{prompt}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Pressable
                style={[aiStyles.writeBtn, { backgroundColor: colors.gold }]}
                onPress={() => {
                  setShowAiSheet(false);
                  setNote(aiPrompts ? `[AI 질문] ${aiPrompts[0]}\n\n` : '');
                  setMeditationVerse(null);
                  openMeditationSheet();
                }}
              >
                <Text style={[aiStyles.writeBtnText, { color: colors.bg }]}>묵상 기록하기</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800' },
  ref: { fontSize: 13, marginBottom: 16 },
  loading: { paddingVertical: 24, alignItems: 'center' },
  loadingText: { fontSize: 14 },
  prompts: { gap: 12, marginBottom: 24 },
  promptRow: {
    flexDirection: 'row', gap: 12,
    borderWidth: 1, borderRadius: 12,
    padding: 14,
  },
  promptNum: { fontSize: 16, fontWeight: '700', width: 20, lineHeight: 22 },
  promptText: { flex: 1, fontSize: 15, lineHeight: 22 },
  writeBtn: {
    paddingVertical: 16, borderRadius: 14, alignItems: 'center',
  },
  writeBtnText: { fontSize: 16, fontWeight: '700' },
});

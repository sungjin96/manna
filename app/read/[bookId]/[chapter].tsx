import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
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
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useBibleText } from '../../../hooks/useBibleText';
import { useReaderSettings, READER_THEMES, ReaderTheme } from '../../../hooks/useReaderSettings';
import { markChapterComplete, isChapterComplete, markVerseRead, getReadVerses } from '../../../db/readings';
import { saveMeditation } from '../../../db/meditations';
import { getSetting, setSetting } from '../../../db/settings';
import { BOOKS } from '../../../constants/books';

// ── Helpers ────────────────────────────────────────────────────────────────
function nextAfter(bookId: number, chapter: number): { bookId: number; chapter: number } {
  const book = BOOKS.find(b => b.id === bookId);
  if (!book) return { bookId: 1, chapter: 1 };
  if (chapter < book.chapters) return { bookId, chapter: chapter + 1 };
  const nextBook = BOOKS.find(b => b.id === bookId + 1);
  return nextBook ? { bookId: nextBook.id, chapter: 1 } : { bookId: 1, chapter: 1 };
}

// ── Confetti ───────────────────────────────────────────────────────────────
const PARTICLE_COLORS = ['#D4A847', '#F0C96A', '#FF7B7B', '#7BFFC8', '#7BB8FF', '#D47BFF', '#FFB87B'];
const PARTICLE_COUNT = 22;

function createParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
    const spread = (Math.random() - 0.5) * 0.6;
    return {
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
      angle: angle + spread,
      distance: 90 + Math.random() * 100,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      size: 6 + Math.random() * 6,
    };
  });
}

// ── Main screen ────────────────────────────────────────────────────────────
export default function ReadScreen() {
  const { bookId: bookIdStr, chapter: chapterStr } = useLocalSearchParams<{
    bookId: string; chapter: string;
  }>();
  const router = useRouter();

  const bookId = Number(bookIdStr);
  const chapter = Number(chapterStr);
  const book = BOOKS.find(b => b.id === bookId);

  const { verses, loading, error } = useBibleText(bookId, chapter);
  const { settings, update: updateSettings, colors } = useReaderSettings();

  // State
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [readVerses, setReadVerses] = useState<Set<number>>(new Set());
  const [showMeditation, setShowMeditation] = useState(false);
  const [meditationVerse, setMeditationVerse] = useState<{ start: number; end: number } | null>(null);
  const [note, setNote] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [meditationPromptEnabled, setMeditationPromptEnabled] = useState(true);

  const flatListRef = useRef<FlatList>(null);
  const particles = useRef<ReturnType<typeof createParticles> | null>(null);
  if (!particles.current) particles.current = createParticles();

  // Load initial data
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
  useEffect(() => {
    if (!verses || verses.length === 0 || readVerses.size === 0) return;
    if (readVerses.size >= verses.length) return;
    const firstUnreadIndex = verses.findIndex(v => !readVerses.has(v.verse));
    if (firstUnreadIndex > 2) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: firstUnreadIndex,
          animated: true,
          viewOffset: 20,
        });
      }, 300);
    }
  }, [verses, readVerses.size]);

  // ── Confetti ──────────────────────────────────────────────────────────────
  function fireConfetti() {
    const pts = particles.current!;
    setShowConfetti(true);
    pts.forEach(p => {
      p.x.setValue(0);
      p.y.setValue(0);
      p.opacity.setValue(1);
      p.scale.setValue(0);
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const animations = pts.map(p =>
      Animated.parallel([
        Animated.timing(p.x, { toValue: Math.cos(p.angle) * p.distance, duration: 700, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: Math.sin(p.angle) * p.distance - 40, duration: 700, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(p.scale, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(p.opacity, { toValue: 0, duration: 580, useNativeDriver: true }),
        ]),
      ])
    );
    Animated.parallel(animations).start(() => setShowConfetti(false));
  }

  // ── Verse tap / long-press ────────────────────────────────────────────────
  async function handleVerseTap(verseNum: number) {
    if (selectionMode) {
      setSelectionRange(prev => {
        if (!prev) return { start: verseNum, end: verseNum };
        return { start: Math.min(prev.start, verseNum), end: Math.max(prev.end, verseNum) };
      });
      return;
    }
    if (readVerses.has(verseNum)) return;
    await markVerseRead(bookId, chapter, verseNum);
    setReadVerses(prev => new Set([...prev, verseNum]));
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

  // ── Selection actions ─────────────────────────────────────────────────────
  function openVerseMeditation() {
    if (!selectionRange) return;
    setMeditationVerse(selectionRange);
    setNote('');
    setShowMeditation(true);
    cancelSelection();
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
      setTimeout(() => {
        setMeditationVerse(null);
        setNote('');
        setShowMeditation(true);
      }, 400);
    } else {
      setTimeout(() => navigateNext(), 400);
    }
  }

  // ── Meditation save ────────────────────────────────────────────────────────
  async function handleSaveMeditation() {
    if (note.trim()) {
      await saveMeditation(bookId, chapter, note.trim(), meditationVerse?.start, meditationVerse?.end);
    }
    closeMeditationModal();
  }

  function closeMeditationModal() {
    setShowMeditation(false);
    setNote('');
    if (!meditationVerse) {
      // chapter-level completion → go to next chapter
      navigateNext();
    }
    setMeditationVerse(null);
  }

  function navigateNext() {
    const next = nextAfter(bookId, chapter);
    router.replace(`/read/${next.bookId}/${next.chapter}`);
  }

  // ── Reader settings persistence ───────────────────────────────────────────
  async function toggleMeditationPrompt(val: boolean) {
    setMeditationPromptEnabled(val);
    await setSetting('meditation_prompt_enabled', val ? '1' : '0');
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const title = book ? `${book.name} ${chapter}장` : `${bookId}:${chapter}`;
  const totalVerses = verses?.length ?? 0;
  const readCount = readVerses.size;
  const progressPct = totalVerses > 0 ? readCount / totalVerses : 0;

  const verseLabel = selectionRange
    ? `${book?.name} ${chapter}:${selectionRange.start}${selectionRange.start !== selectionRange.end ? `–${selectionRange.end}` : ''} 선택됨`
    : '';

  const fontFamily = settings.font === 'serif'
    ? (Platform.OS === 'ios' ? 'Georgia' : 'serif')
    : undefined;

  // ── Render verse row ──────────────────────────────────────────────────────
  const renderVerse = ({ item }: { item: { verse: number; text: string } }) => {
    const isRead = readVerses.has(item.verse);
    const inSelection = selectionMode && selectionRange
      && item.verse >= selectionRange.start && item.verse <= selectionRange.end;

    return (
      <Pressable
        onPress={() => handleVerseTap(item.verse)}
        onLongPress={() => handleVerseLongPress(item.verse)}
        delayLongPress={400}
        style={[
          styles.verseRow,
          isRead && styles.verseRowRead,
          inSelection && { backgroundColor: `${colors.gold}25`, borderRadius: 6 },
        ]}
      >
        {isRead && <View style={[styles.verseBorder, { backgroundColor: colors.gold }]} />}
        <Text style={[
          styles.verseNum,
          { color: colors.gold, opacity: isRead ? 0.6 : 0.75, fontFamily },
        ]}>
          {item.verse}
        </Text>
        <Text style={[
          styles.verseText,
          {
            color: colors.text,
            fontSize: settings.fontSize,
            lineHeight: settings.fontSize * settings.lineHeight,
            fontFamily,
            opacity: isRead ? 0.6 : 1,
          },
        ]}>
          {item.text}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerBackTitle: '',
          headerStyle: { backgroundColor: colors.headerBg },
          headerTintColor: colors.gold,
          headerTitleStyle: { color: colors.text, fontWeight: '700' },
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable
              onPress={() => setShowSettings(true)}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="format-size" size={22} color={colors.gold} />
            </Pressable>
          ),
        }}
      />

      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {/* Chapter progress bar */}
        {totalVerses > 0 && (
          <View style={[styles.progressHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.progressFill, { width: `${progressPct * 100}%` as any, backgroundColor: colors.gold }]} />
            </View>
            <Text style={[styles.progressLabel, { color: colors.muted }]}>
              {readCount} / {totalVerses}절 읽음
            </Text>
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <Text style={[styles.loadingText, { color: colors.muted }]}>읽는 중...</Text>
          </View>
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
            onScrollToIndexFailed={() => {}}
            renderItem={renderVerse}
            ListFooterComponent={
              <Pressable
                style={({ pressed }) => [
                  styles.completeBtn,
                  alreadyDone && styles.doneBtnDisabled,
                  pressed && !alreadyDone && styles.completeBtnPressed,
                ]}
                onPress={handleComplete}
                disabled={alreadyDone}
              >
                {alreadyDone ? (
                  <View style={styles.doneBtnInner}>
                    <MaterialCommunityIcons name="check-circle" size={20} color={colors.gold} />
                    <Text style={[styles.completeBtnText, { color: colors.gold }]}>완료됨</Text>
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
            {particles.current!.map((p, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.particle,
                  {
                    width: p.size, height: p.size, borderRadius: p.size / 2,
                    backgroundColor: p.color, opacity: p.opacity,
                    transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.scale }],
                  },
                ]}
              />
            ))}
          </View>
        )}

        {/* Selection bar */}
        {selectionMode && selectionRange && (
          <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <Text style={[styles.selectionLabel, { color: colors.text }]} numberOfLines={1}>
              {verseLabel}
            </Text>
            <View style={styles.selectionActions}>
              <Pressable
                style={[styles.selBtn, { backgroundColor: colors.gold }]}
                onPress={openVerseMeditation}
              >
                <MaterialCommunityIcons name="notebook-edit-outline" size={15} color="#0B0A12" />
                <Text style={[styles.selBtnText, { color: '#0B0A12' }]}>묵상</Text>
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
        <Modal visible={showMeditation} transparent animationType="slide">
          <KeyboardAvoidingView
            style={styles.overlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <Pressable style={StyleSheet.absoluteFillObject} onPress={Keyboard.dismiss} />
            <View style={[styles.modal, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.muted }]} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>오늘의 묵상</Text>
              <Text style={[styles.modalSub, { color: colors.gold }]}>
                {meditationVerse
                  ? `${book?.name} ${chapter}:${meditationVerse.start}${meditationVerse.start !== meditationVerse.end ? `–${meditationVerse.end}` : ''}`
                  : `${book?.name} ${chapter}장 — 한 줄이라도 남겨보세요 (선택)`}
              </Text>
              <TextInput
                style={[styles.textInput, { color: colors.text, backgroundColor: `${colors.bg}`, borderColor: colors.border }]}
                placeholder="오늘 읽은 말씀에서 받은 것..."
                placeholderTextColor={colors.muted}
                multiline
                maxLength={200}
                value={note}
                onChangeText={setNote}
                autoFocus
              />
              <Text style={[styles.charCount, { color: colors.muted }]}>{note.length}/200</Text>
              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.skipBtn, { borderColor: colors.border }]}
                  onPress={() => { Keyboard.dismiss(); closeMeditationModal(); }}
                >
                  <Text style={[styles.skipBtnText, { color: colors.muted }]}>건너뛰기</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, { backgroundColor: colors.gold }, !note.trim() && styles.saveBtnDisabled]}
                  onPress={handleSaveMeditation}
                  disabled={!note.trim()}
                >
                  <Text style={[styles.saveBtnText, { color: '#0B0A12' }]}>저장</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Reader settings sheet */}
        <Modal visible={showSettings} transparent animationType="slide">
          <Pressable style={styles.overlay} onPress={() => setShowSettings(false)}>
            <Pressable onPress={() => {}} style={[styles.settingsSheet, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.muted }]} />
              <Text style={[styles.settingsTitle, { color: colors.text }]}>읽기 설정</Text>

              {/* Theme */}
              <Text style={[styles.settingLabel, { color: colors.muted }]}>화면 테마</Text>
              <View style={styles.themeRow}>
                {(['dark', 'sepia', 'light'] as ReaderTheme[]).map(t => {
                  const tc = READER_THEMES[t];
                  return (
                    <Pressable
                      key={t}
                      style={[
                        styles.themeSwatch,
                        { backgroundColor: tc.bg, borderColor: settings.theme === t ? tc.gold : tc.border },
                        settings.theme === t && styles.themeSwatchActive,
                      ]}
                      onPress={() => updateSettings({ theme: t })}
                    >
                      <Text style={[styles.themeSwatchLabel, { color: tc.text }]}>
                        {t === 'dark' ? '다크' : t === 'sepia' ? '세피아' : '라이트'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Font size */}
              <Text style={[styles.settingLabel, { color: colors.muted }]}>글자 크기</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  style={[styles.stepBtn, { borderColor: colors.border }]}
                  onPress={() => updateSettings({ fontSize: Math.max(14, settings.fontSize - 1) })}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="minus" size={18} color={colors.text} />
                </Pressable>
                <Text style={[styles.stepValue, { color: colors.text }]}>{settings.fontSize}</Text>
                <Pressable
                  style={[styles.stepBtn, { borderColor: colors.border }]}
                  onPress={() => updateSettings({ fontSize: Math.min(22, settings.fontSize + 1) })}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
                </Pressable>
                <Text style={[styles.stepPreview, { color: colors.text, fontSize: settings.fontSize, fontFamily }]}>
                  미리보기 가나다
                </Text>
              </View>

              {/* Line height */}
              <Text style={[styles.settingLabel, { color: colors.muted }]}>줄 간격</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  style={[styles.stepBtn, { borderColor: colors.border }]}
                  onPress={() => updateSettings({ lineHeight: Math.max(1.4, Math.round((settings.lineHeight - 0.1) * 10) / 10) })}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="minus" size={18} color={colors.text} />
                </Pressable>
                <Text style={[styles.stepValue, { color: colors.text }]}>{settings.lineHeight.toFixed(1)}</Text>
                <Pressable
                  style={[styles.stepBtn, { borderColor: colors.border }]}
                  onPress={() => updateSettings({ lineHeight: Math.min(2.0, Math.round((settings.lineHeight + 0.1) * 10) / 10) })}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
                </Pressable>
              </View>

              {/* Font */}
              <Text style={[styles.settingLabel, { color: colors.muted }]}>폰트</Text>
              <View style={styles.fontRow}>
                {(['default', 'serif'] as const).map(f => (
                  <Pressable
                    key={f}
                    style={[
                      styles.fontBtn,
                      { borderColor: settings.font === f ? colors.gold : colors.border },
                      settings.font === f && { backgroundColor: `${colors.gold}20` },
                    ]}
                    onPress={() => updateSettings({ font: f })}
                  >
                    <Text style={[
                      styles.fontBtnText,
                      { color: settings.font === f ? colors.gold : colors.muted },
                      f === 'serif' && { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
                    ]}>
                      {f === 'default' ? '기본체' : '세리프체'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Meditation prompt toggle */}
              <View style={[styles.toggleRow, { borderTopColor: colors.border }]}>
                <View style={styles.toggleInfo}>
                  <Text style={[styles.toggleLabel, { color: colors.text }]}>읽기 완료 후 묵상 입력</Text>
                  <Text style={[styles.toggleDesc, { color: colors.muted }]}>끄면 완료 즉시 다음 챕터로 이동</Text>
                </View>
                <Switch
                  value={meditationPromptEnabled}
                  onValueChange={toggleMeditationPrompt}
                  trackColor={{ false: colors.border, true: `${colors.gold}80` }}
                  thumbColor={meditationPromptEnabled ? colors.gold : colors.muted}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16 },
  list: { padding: 20, paddingBottom: 60 },

  // Progress header
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 1,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  progressLabel: { fontSize: 11, letterSpacing: 0.3, minWidth: 70 },

  // Verse rows
  verseRow: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 10,
    paddingLeft: 4,
  },
  verseRowRead: { paddingLeft: 0 },
  verseBorder: {
    width: 2,
    borderRadius: 1,
    alignSelf: 'stretch',
    marginRight: 2,
  },
  verseNum: {
    fontSize: 11,
    width: 22,
    paddingTop: 4,
    fontWeight: '700',
  },
  verseText: {
    flex: 1,
  },

  // Complete button
  completeBtn: {
    marginTop: 32,
    backgroundColor: '#D4A847',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  completeBtnPressed: { opacity: 0.85 },
  doneBtnDisabled: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(212,168,71,0.3)',
  },
  doneBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  completeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Confetti
  confettiOverlay: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    height: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  particle: { position: 'absolute' },

  // Selection bar
  selectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    gap: 8,
  },
  selectionLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  selectionActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  selBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  selBtnText: { fontSize: 13, fontWeight: '600' },
  selBtnCancel: { padding: 4 },

  // Meditation modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 44,
    borderTopWidth: 1,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  modalSub: { fontSize: 13, marginBottom: 16 },
  textInput: {
    borderWidth: 1, borderRadius: 12,
    padding: 14, fontSize: 16,
    minHeight: 100, textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  skipBtn: {
    flex: 1, padding: 15, borderRadius: 12,
    borderWidth: 1, alignItems: 'center',
  },
  skipBtnText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, fontWeight: '700' },

  // Reader settings sheet
  settingsSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 48,
    borderTopWidth: 1,
  },
  settingsTitle: { fontSize: 18, fontWeight: '800', marginBottom: 20 },
  settingLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginTop: 16 },

  themeRow: { flexDirection: 'row', gap: 10 },
  themeSwatch: {
    flex: 1, height: 56, borderRadius: 12,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  themeSwatchActive: { borderWidth: 2 },
  themeSwatchLabel: { fontSize: 12, fontWeight: '700' },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 36, height: 36, borderRadius: 10,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  stepValue: { fontSize: 16, fontWeight: '700', minWidth: 32, textAlign: 'center' },
  stepPreview: { flex: 1, textAlign: 'right' },

  fontRow: { flexDirection: 'row', gap: 10 },
  fontBtn: {
    flex: 1, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1,
    alignItems: 'center',
  },
  fontBtnText: { fontSize: 14, fontWeight: '600' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20, paddingTop: 20, borderTopWidth: 1,
    gap: 12,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  toggleDesc: { fontSize: 12 },
});

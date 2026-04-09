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
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useBibleText } from '../../../hooks/useBibleText';
import { markChapterComplete, isChapterComplete } from '../../../db/readings';
import { saveMeditation } from '../../../db/meditations';
import { BOOKS } from '../../../constants/books';
import { theme } from '../../../constants/theme';

// ── Confetti particles ─────────────────────────────────────────────────────
const PARTICLE_COLORS = ['#D4A847', '#F0C96A', '#FF7B7B', '#7BFFC8', '#7BB8FF', '#D47BFF', '#FFB87B'];
const PARTICLE_COUNT = 22;

function createParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
    const spread = (Math.random() - 0.5) * 0.6;
    const distance = 90 + Math.random() * 100;
    return {
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
      angle: angle + spread,
      distance,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      size: 6 + Math.random() * 6,
    };
  });
}

export default function ReadScreen() {
  const { bookId: bookIdStr, chapter: chapterStr } = useLocalSearchParams<{
    bookId: string;
    chapter: string;
  }>();
  const router = useRouter();

  const bookId = Number(bookIdStr);
  const chapter = Number(chapterStr);
  const book = BOOKS.find(b => b.id === bookId);

  const { verses, loading, error } = useBibleText(bookId, chapter);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [showMeditation, setShowMeditation] = useState(false);
  const [note, setNote] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);

  const particles = useRef<ReturnType<typeof createParticles> | null>(null);
  if (!particles.current) particles.current = createParticles();

  useEffect(() => {
    isChapterComplete(bookId, chapter).then(setAlreadyDone);
  }, [bookId, chapter]);

  function fireConfetti() {
    const pts = particles.current!;
    setShowConfetti(true);
    pts.forEach(p => {
      p.x.setValue(0);
      p.y.setValue(0);
      p.opacity.setValue(1);
      p.scale.setValue(0);
    });

    const animations = pts.map(p =>
      Animated.parallel([
        Animated.timing(p.x, {
          toValue: Math.cos(p.angle) * p.distance,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(p.y, {
          toValue: Math.sin(p.angle) * p.distance - 40,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(p.scale, {
            toValue: 1,
            duration: 120,
            useNativeDriver: true,
          }),
          Animated.timing(p.opacity, {
            toValue: 0,
            duration: 580,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    Animated.parallel(animations).start(() => setShowConfetti(false));
  }

  async function handleComplete() {
    if (alreadyDone) return;
    fireConfetti();
    await markChapterComplete(bookId, chapter);
    setAlreadyDone(true);
    setTimeout(() => setShowMeditation(true), 400);
  }

  async function handleSaveMeditation() {
    if (note.trim()) {
      await saveMeditation(bookId, chapter, note.trim());
    }
    setShowMeditation(false);
    router.back();
  }

  const title = book ? `${book.name} ${chapter}장` : `${bookId}:${chapter}`;

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.gold,
          headerTitleStyle: { color: theme.text, fontWeight: '700' },
          headerShadowVisible: false,
        }}
      />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.center}>
            <Text style={styles.loadingText}>읽는 중...</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="alert-circle-outline" size={40} color={theme.textMuted} />
            <Text style={[styles.loadingText, { marginTop: 12 }]}>본문을 불러올 수 없어요</Text>
          </View>
        ) : (
          <FlatList
            data={verses}
            keyExtractor={v => String(v.verse)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.verseRow}>
                <Text style={styles.verseNum}>{item.verse}</Text>
                <Text style={styles.verseText}>{item.text}</Text>
              </View>
            )}
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
                    <MaterialCommunityIcons name="check-circle" size={20} color={theme.bg} />
                    <Text style={styles.completeBtnText}>완료됨</Text>
                  </View>
                ) : (
                  <Text style={styles.completeBtnText}>읽기 완료</Text>
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
                    width: p.size,
                    height: p.size,
                    borderRadius: p.size / 2,
                    backgroundColor: p.color,
                    opacity: p.opacity,
                    transform: [
                      { translateX: p.x },
                      { translateY: p.y },
                      { scale: p.scale },
                    ],
                  },
                ]}
              />
            ))}
          </View>
        )}

        {/* Meditation bottom sheet */}
        <Modal visible={showMeditation} transparent animationType="slide">
          <KeyboardAvoidingView
            style={styles.overlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            {/* Tap dark area to dismiss keyboard */}
            <Pressable style={StyleSheet.absoluteFillObject} onPress={Keyboard.dismiss} />
            <View style={styles.modal}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>오늘의 묵상</Text>
              <Text style={styles.modalSub}>한 줄이라도 남겨보세요 (선택)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="오늘 읽은 말씀에서 받은 것..."
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={200}
                value={note}
                onChangeText={setNote}
                autoFocus
              />
              <Text style={styles.charCount}>{note.length}/200</Text>
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.skipBtn}
                  onPress={() => { Keyboard.dismiss(); setShowMeditation(false); router.back(); }}
                >
                  <Text style={styles.skipBtnText}>건너뛰기</Text>
                </Pressable>
                <Pressable style={styles.saveBtn} onPress={handleSaveMeditation}>
                  <Text style={styles.saveBtnText}>저장</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: theme.textMuted, fontSize: 16 },
  list: { padding: 20, paddingBottom: 48 },

  verseRow: { flexDirection: 'row', marginBottom: 14, gap: 12 },
  verseNum: {
    fontSize: 11,
    color: theme.gold,
    width: 24,
    paddingTop: 4,
    fontWeight: '700',
    opacity: 0.7,
  },
  verseText: {
    fontSize: 17,
    lineHeight: 28,
    flex: 1,
    color: theme.text,
    letterSpacing: 0.2,
  },

  completeBtn: {
    marginTop: 32,
    backgroundColor: theme.gold,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  completeBtnPressed: { backgroundColor: theme.goldDark },
  doneBtnDisabled: {
    backgroundColor: theme.surface2,
    borderWidth: 1,
    borderColor: theme.goldBorder,
  },
  doneBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  completeBtnText: {
    color: theme.bg,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  confettiOverlay: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    height: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  particle: {
    position: 'absolute',
  },

  // Meditation modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 44,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.borderSubtle,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 4,
  },
  modalSub: { fontSize: 13, color: theme.textMuted, marginBottom: 16 },
  textInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    color: theme.text,
    backgroundColor: theme.surface2,
  },
  charCount: {
    fontSize: 11,
    color: theme.textMuted,
    textAlign: 'right',
    marginTop: 6,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  skipBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    alignItems: 'center',
  },
  skipBtnText: { color: theme.textSub, fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    backgroundColor: theme.gold,
    alignItems: 'center',
  },
  saveBtnText: { color: theme.bg, fontSize: 15, fontWeight: '700' },
});

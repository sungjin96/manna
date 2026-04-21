import { useRef, useState } from 'react';
import { Animated, Keyboard, PanResponder } from 'react-native';

export type MeditationMode = 'basic' | 'qa' | 'memo';
export interface QAEntry { q: string; a: string; }

export function useMeditationSheet(onNavigateNext: () => void) {
  const [showMeditation, setShowMeditation] = useState(false);
  const [meditationVerse, setMeditationVerse] = useState<{ start: number; end: number } | null>(null);
  const [note, setNote] = useState('');
  const [memoText, setMemoText] = useState('');
  const [meditationMode, setMeditationMode] = useState<MeditationMode>('qa');
  const [qaEntries, setQaEntries] = useState<QAEntry[]>([{ q: '', a: '' }]);

  const meditationSheetY = useRef(new Animated.Value(600)).current;
  const meditationBgOpacity = useRef(new Animated.Value(0)).current;

  function openMeditationSheet() {
    meditationSheetY.setValue(600);
    meditationBgOpacity.setValue(0);
    setShowMeditation(true);
    Animated.parallel([
      Animated.spring(meditationSheetY, { toValue: 0, friction: 9, tension: 100, useNativeDriver: true }),
      Animated.timing(meditationBgOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }

  function closeMeditationSheet(afterClose?: () => void) {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(meditationSheetY, { toValue: 600, duration: 220, useNativeDriver: true }),
      Animated.timing(meditationBgOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setShowMeditation(false);
      setNote('');
      setMemoText('');
      setMeditationVerse(null);
      setMeditationMode('qa');
      setQaEntries([{ q: '', a: '' }]);
      afterClose?.();
    });
  }

  // Stale closure fix: keep latest meditationVerse and onNavigateNext in refs
  // so the PanResponder (created once) always has fresh values.
  const meditationVerseRef = useRef(meditationVerse);
  meditationVerseRef.current = meditationVerse;

  const onNavigateNextRef = useRef(onNavigateNext);
  onNavigateNextRef.current = onNavigateNext;

  const onSwipeDismiss = useRef<() => void>(() => {});
  onSwipeDismiss.current = () => {
    // Swipe = close only, no navigation (same as overlay tap)
    // Use the skip button to navigate to next chapter intentionally
    closeMeditationSheet();
  };

  const meditationPR = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, { dy }) => {
      if (dy > 0) meditationSheetY.setValue(dy);
    },
    onPanResponderRelease: (_, { dy, vy }) => {
      if (dy > 100 || vy > 0.5) {
        onSwipeDismiss.current();
      } else {
        Animated.spring(meditationSheetY, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

  return {
    showMeditation,
    meditationVerse,
    setMeditationVerse,
    note,
    setNote,
    memoText,
    setMemoText,
    meditationMode,
    setMeditationMode,
    qaEntries,
    setQaEntries,
    meditationSheetY,
    meditationBgOpacity,
    meditationPR,
    openMeditationSheet,
    closeMeditationSheet,
  };
}

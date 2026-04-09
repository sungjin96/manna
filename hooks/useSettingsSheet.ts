import { useRef, useState } from 'react';
import { Animated, PanResponder } from 'react-native';

export function useSettingsSheet() {
  const [showSettings, setShowSettings] = useState(false);

  const settingsSheetY = useRef(new Animated.Value(600)).current;
  const settingsBgOpacity = useRef(new Animated.Value(0)).current;

  function openSettingsSheet() {
    settingsSheetY.setValue(600);
    settingsBgOpacity.setValue(0);
    setShowSettings(true);
    Animated.parallel([
      Animated.spring(settingsSheetY, { toValue: 0, friction: 9, tension: 100, useNativeDriver: true }),
      Animated.timing(settingsBgOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }

  function closeSettingsSheet() {
    Animated.parallel([
      Animated.timing(settingsSheetY, { toValue: 600, duration: 220, useNativeDriver: true }),
      Animated.timing(settingsBgOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setShowSettings(false));
  }

  // Stale closure fix: PanResponder is created once, so we use a ref
  // that gets updated every render with the latest closeSettingsSheet.
  const onSwipeDismiss = useRef<() => void>(() => {});
  onSwipeDismiss.current = closeSettingsSheet;

  const settingsPR = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, { dy }) => {
      if (dy > 0) settingsSheetY.setValue(dy);
    },
    onPanResponderRelease: (_, { dy, vy }) => {
      if (dy > 100 || vy > 0.5) {
        onSwipeDismiss.current();
      } else {
        Animated.spring(settingsSheetY, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

  return {
    showSettings,
    settingsSheetY,
    settingsBgOpacity,
    settingsPR,
    openSettingsSheet,
    closeSettingsSheet,
  };
}

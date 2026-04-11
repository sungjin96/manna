import { useRef, useState } from 'react';
import { Animated, Easing, PanResponder, useWindowDimensions } from 'react-native';

export function useSettingsSheet(onAfterClose?: () => void) {
  const [showSettings, setShowSettings] = useState(false);
  const { height: windowHeight } = useWindowDimensions();

  // 시트 최대 높이 ≈ 85% of window
  // PEEK_Y: 시트가 이만큼 내려가면 화면 테마 섹션만 보임 (상단 ~200px 노출)
  const PEEK_Y = Math.max(200, Math.round(windowHeight * 0.85) - 200);

  // settingsSheetY: useNativeDriver: false — JS 스레드에서 _value가 항상 정확하게 유지됨
  const settingsSheetY = useRef(new Animated.Value(600)).current;
  // backdrop opacity는 native driver 유지 (성능)
  const settingsBgOpacity = useRef(new Animated.Value(0)).current;

  const settingsDragBase = useRef(0);

  // onAfterClose ref — stale closure 방지
  const onAfterCloseRef = useRef(onAfterClose);
  onAfterCloseRef.current = onAfterClose;

  const peekYRef = useRef(PEEK_Y);
  peekYRef.current = PEEK_Y;

  function openSettingsSheet() {
    settingsSheetY.setValue(600);
    settingsBgOpacity.setValue(0);
    settingsDragBase.current = 0;
    setShowSettings(true);
    Animated.spring(settingsSheetY, { toValue: 0, friction: 9, tension: 100, useNativeDriver: false }).start();
    Animated.timing(settingsBgOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }

  function closeSettingsSheet() {
    settingsDragBase.current = 0;
    Animated.timing(settingsSheetY, { toValue: 600, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: false })
      .start(() => {
        setShowSettings(false);
        onAfterCloseRef.current?.();
      });
    Animated.timing(settingsBgOpacity, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }

  // 스와이프로 닫을 때: 시트 Y 즉시 오프스크린, backdrop만 짧게 페이드아웃
  // → 어느 위치에서 손을 떼도 peek 위치에서 멈칫하는 현상 없음
  function swipeDismissSettingsSheet() {
    settingsDragBase.current = 0;
    settingsSheetY.setValue(800);
    Animated.timing(settingsBgOpacity, { toValue: 0, duration: 120, useNativeDriver: true })
      .start(() => {
        setShowSettings(false);
        onAfterCloseRef.current?.();
      });
  }

  const onSwipeDismiss = useRef<() => void>(() => {});
  onSwipeDismiss.current = swipeDismissSettingsSheet;

  const settingsPR = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      // useNativeDriver: false이므로 _value가 현재 실제 위치를 정확히 반영
      settingsDragBase.current = (settingsSheetY as any)._value ?? 0;
    },
    onPanResponderMove: (_, { dy }) => {
      const newY = settingsDragBase.current + dy;
      if (newY > 0) settingsSheetY.setValue(newY);
    },
    onPanResponderRelease: (_, { dy, vy }) => {
      const peek = peekYRef.current;
      const base = settingsDragBase.current;
      const finalY = base + dy;
      const startedAtPeek = base >= peek * 0.7;

      if (startedAtPeek) {
        // peek 상태에서 출발: 80px+ 아래로 내리거나 중간 플릭 → 닫기
        if (dy > 80 || vy > 0.8) {
          onSwipeDismiss.current();
        } else if (dy < -80 || finalY < peek * 0.5) {
          // 위로 충분히 올림 → 전체 열림으로 복귀
          Animated.spring(settingsSheetY, { toValue: 0, friction: 20, tension: 100, overshootClamping: true, useNativeDriver: false }).start();
        } else {
          // 소폭 이동 → peek 유지
          Animated.spring(settingsSheetY, { toValue: peek, friction: 14, tension: 100, overshootClamping: true, useNativeDriver: false }).start();
        }
      } else {
        // 전체 열림에서 출발: peek+100 이상이어야 닫기 (빠른 플릭 제외)
        if (finalY > peek + 100 || (vy > 2.0 && finalY > peek * 0.4)) {
          onSwipeDismiss.current();
        } else if (finalY >= peek * 0.4) {
          // 충분히 내렸음 → peek 스냅
          Animated.spring(settingsSheetY, { toValue: peek, friction: 14, tension: 100, overshootClamping: true, useNativeDriver: false }).start();
        } else {
          // 조금만 움직임 → 전체 열림으로 복귀
          Animated.spring(settingsSheetY, { toValue: 0, friction: 20, tension: 100, overshootClamping: true, useNativeDriver: false }).start();
        }
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

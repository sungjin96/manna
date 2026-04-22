import { useRef, useCallback, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type SwipeAction = {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
};

type Props = {
  children: React.ReactNode;
  rightActions: SwipeAction[];
  style?: ViewStyle;
  disabled?: boolean;
};

const ACTION_WIDTH = 72;
const SNAP_THRESHOLD = 36;
const VELOCITY_THRESHOLD = 0.3;

export default function SwipeableRow({ children, rightActions, style, disabled }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const totalActionWidth = rightActions.length * ACTION_WIDTH;
  const translateX = useRef(new Animated.Value(0)).current;
  const restValue = useRef(0);
  const startDx = useRef(0);
  const isOpen = useRef(false);
  const isHorizontalSwipe = useRef(false);
  const [cardWidth, setCardWidth] = useState(windowWidth);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setCardWidth(e.nativeEvent.layout.width);
  }, []);

  const snapTo = useCallback(
    (toValue: number) => {
      isOpen.current = toValue !== 0;
      restValue.current = toValue;
      Animated.spring(translateX, {
        toValue,
        useNativeDriver: true,
        speed: 16,
        bounciness: 3,
      }).start();
    },
    [translateX]
  );

  const close = useCallback(() => snapTo(0), [snapTo]);
  const open = useCallback(() => snapTo(-totalActionWidth), [snapTo, totalActionWidth]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => {
        const horizontal = Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 2;
        if (horizontal) isHorizontalSwipe.current = true;
        return horizontal;
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => isHorizontalSwipe.current,
      onPanResponderGrant: (_, g) => {
        translateX.stopAnimation();
        startDx.current = g.dx;
      },
      onPanResponderMove: (_, g) => {
        const delta = g.dx - startDx.current;
        const raw = restValue.current + delta;
        const clamped = Math.min(0, Math.max(-totalActionWidth - 20, raw));
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, g) => {
        isHorizontalSwipe.current = false;
        const cur = (translateX as any)._value as number ?? restValue.current;
        restValue.current = cur;

        if (isOpen.current) {
          if (g.dx > SNAP_THRESHOLD || g.vx > VELOCITY_THRESHOLD) {
            snapTo(0);
          } else {
            snapTo(-totalActionWidth);
          }
        } else {
          if (g.dx < -SNAP_THRESHOLD || g.vx < -VELOCITY_THRESHOLD) {
            snapTo(-totalActionWidth);
          } else {
            snapTo(0);
          }
        }
      },
      onPanResponderTerminate: () => {
        isHorizontalSwipe.current = false;
        if (isOpen.current) open(); else close();
      },
    })
  ).current;

  return (
    <View style={[styles.container, style]} onLayout={onLayout}>
      {/* 카드 + 액션 버튼을 같은 row에 배치 — 전체를 함께 이동하므로 터치 영역도 정확히 이동 */}
      <Animated.View
        style={[styles.row, { transform: [{ translateX }] }]}
        {...(!disabled ? panResponder.panHandlers : {})}
      >
        <View style={{ width: cardWidth }}>
          {children}
        </View>
        {!disabled && rightActions.map((action, i) => (
          <Pressable
            key={i}
            style={[styles.actionBtn, { backgroundColor: action.color, width: ACTION_WIDTH }]}
            onPress={() => {
              close();
              setTimeout(action.onPress, 120);
            }}
          >
            <MaterialCommunityIcons name={action.icon as any} size={20} color="#fff" />
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionLabel: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
});

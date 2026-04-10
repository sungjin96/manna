import { useRef } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export function useHeaderAnim(headerFullH: number) {
  const headerOpacity = useRef(new Animated.Value(1)).current;
  const headerHeightAnim = useRef(new Animated.Value(1)).current;
  const bottomNavOpacity = useRef(new Animated.Value(1)).current;
  const headerVisibleRef = useRef(true);
  const lastScrollY = useRef(0);

  const headerHeightValue = headerHeightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, headerFullH],
  });

  function animateHeader(show: boolean) {
    if (headerVisibleRef.current === show) return;
    headerVisibleRef.current = show;
    Animated.timing(headerOpacity, { toValue: show ? 1 : 0, duration: 180, useNativeDriver: false }).start();
    Animated.timing(headerHeightAnim, { toValue: show ? 1 : 0, duration: 200, useNativeDriver: false }).start();
    Animated.timing(bottomNavOpacity, { toValue: show ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = event.nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    lastScrollY.current = y;
    if (dy > 6 && y > 80) animateHeader(false);
    else if (dy < -6) animateHeader(true);
  }

  return {
    headerOpacity,
    headerHeightAnim,
    headerHeightValue,
    bottomNavOpacity,
    animateHeader,
    handleScroll,
  };
}

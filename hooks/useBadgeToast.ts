import { useRef, useState } from 'react';
import { Animated } from 'react-native';
import type { BadgeIconName, Tier } from '../app/(tabs)/achievements';

export interface BadgeToastItem {
  id: string;
  icon: BadgeIconName;
  title: string;
  tier: Tier;
}

export function useBadgeToast() {
  const [toastItem, setToastItem] = useState<BadgeToastItem | null>(null);
  const toastY = useRef(new Animated.Value(-120)).current;
  const toastQueue = useRef<BadgeToastItem[]>([]);
  const isShowing = useRef(false);

  function processQueue() {
    if (isShowing.current || toastQueue.current.length === 0) return;
    const next = toastQueue.current.shift()!;
    isShowing.current = true;
    setToastItem(next);
    toastY.setValue(-120);
    Animated.sequence([
      Animated.spring(toastY, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      Animated.delay(2800),
      Animated.timing(toastY, { toValue: -120, duration: 280, useNativeDriver: true }),
    ]).start(() => {
      setToastItem(null);
      isShowing.current = false;
      processQueue();
    });
  }

  function showBadgeToast(item: BadgeToastItem) {
    toastQueue.current.push(item);
    processQueue();
  }

  function dismissToast() {
    Animated.timing(toastY, { toValue: -120, duration: 220, useNativeDriver: true }).start(() => {
      setToastItem(null);
      isShowing.current = false;
      processQueue();
    });
  }

  return { toastItem, toastY, showBadgeToast, dismissToast };
}

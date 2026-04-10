import { createContext, useContext, useRef, useState } from 'react';
import { Animated } from 'react-native';
import type { BadgeToastItem } from '../hooks/useBadgeToast';
import { BadgeToast } from '../components/BadgeToast';

interface BadgeToastContextValue {
  showBadgeToast: (item: BadgeToastItem) => void;
}

const BadgeToastContext = createContext<BadgeToastContextValue>({
  showBadgeToast: () => {},
});

export function BadgeToastProvider({ children }: { children: React.ReactNode }) {
  const [toastItem, setToastItem] = useState<BadgeToastItem | null>(null);
  const toastY = useRef(new Animated.Value(-120)).current;
  const toastQueue = useRef<BadgeToastItem[]>([]);
  const isShowing = useRef(false);
  const currentAnimation = useRef<Animated.CompositeAnimation | null>(null);

  function processQueue() {
    if (isShowing.current || toastQueue.current.length === 0) return;
    const next = toastQueue.current.shift()!;
    isShowing.current = true;
    setToastItem(next);
    toastY.setValue(-120);

    const anim = Animated.sequence([
      Animated.spring(toastY, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      Animated.delay(4000),
      Animated.timing(toastY, { toValue: -120, duration: 280, useNativeDriver: true }),
    ]);
    currentAnimation.current = anim;
    anim.start(({ finished }) => {
      if (finished) {
        setToastItem(null);
        isShowing.current = false;
        currentAnimation.current = null;
        processQueue();
      }
    });
  }

  function showBadgeToast(item: BadgeToastItem) {
    toastQueue.current.push(item);
    processQueue();
  }

  function dismissToast() {
    currentAnimation.current?.stop();
    currentAnimation.current = null;
    Animated.timing(toastY, { toValue: -120, duration: 220, useNativeDriver: true }).start(() => {
      setToastItem(null);
      isShowing.current = false;
      processQueue();
    });
  }

  return (
    <BadgeToastContext.Provider value={{ showBadgeToast }}>
      {children}
      {toastItem && (
        <BadgeToast item={toastItem} toastY={toastY} onDismiss={dismissToast} />
      )}
    </BadgeToastContext.Provider>
  );
}

export function useShowBadgeToast() {
  return useContext(BadgeToastContext).showBadgeToast;
}

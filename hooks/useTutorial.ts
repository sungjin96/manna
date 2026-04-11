import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { getSetting, setSetting } from '../db/settings';

const TOTAL_STEPS = 4;

export function useTutorial(onComplete?: () => void) {
  const [isActive, setIsActive] = useState(false);
  const [step, setStep] = useState(0);
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getSetting('tutorial_reading_complete', '0').then(val => {
      if (val === '0') {
        setTimeout(() => {
          setIsActive(true);
          Animated.timing(overlayOpacity, {
            toValue: 1, duration: 350, useNativeDriver: true,
          }).start();
        }, 900);
      }
    });
  }, []);

  function advanceStep() {
    if (step < TOTAL_STEPS - 1) {
      setStep(s => s + 1);
    } else {
      dismiss();
    }
  }

  function dismiss() {
    Animated.timing(overlayOpacity, {
      toValue: 0, duration: 220, useNativeDriver: true,
    }).start(() => {
      setIsActive(false);
      setSetting('tutorial_reading_complete', '1').then(() => {
        onComplete?.();
      });
    });
  }

  return { isActive, step, overlayOpacity, advanceStep, dismiss };
}

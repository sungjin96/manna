import { useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

export const TTS_RATES = [0.75, 0.9, 1.1, 1.3];
export const TTS_RATE_LABELS = ['0.75×', '1×', '1.25×', '1.5×'];

export function useTTS(verses: Array<{ verse: number; text: string }> | null | undefined) {
  const [isTTS, setIsTTS] = useState(false);
  const [ttsVerse, setTtsVerse] = useState<number | null>(null);
  const [ttsRateIdx, setTtsRateIdx] = useState(1);
  const [showTTSMenu, setShowTTSMenu] = useState(false);

  const ttsRef = useRef({ cancel: false });
  const ttsRateIdxRef = useRef(1);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ttsRef.current.cancel = true;
      Speech.stop();
    };
  }, []);

  async function startTTS() {
    if (!verses || verses.length === 0) return;
    setIsTTS(true);
    ttsRef.current.cancel = false;
    for (let i = 0; i < verses.length; i++) {
      if (ttsRef.current.cancel) break;
      setTtsVerse(verses[i].verse);
      const rate = TTS_RATES[ttsRateIdxRef.current];
      await new Promise<void>(resolve => {
        Speech.speak(verses[i].text, {
          language: 'ko-KR',
          rate,
          onDone: resolve,
          onStopped: resolve,
          onError: () => resolve(),
        });
      });
    }
    setIsTTS(false);
    setTtsVerse(null);
  }

  async function stopTTS() {
    ttsRef.current.cancel = true;
    await Speech.stop();
    setIsTTS(false);
    setTtsVerse(null);
  }

  function toggleTTS() {
    if (isTTS) stopTTS(); else startTTS();
  }

  function selectTTSRate(idx: number) {
    ttsRateIdxRef.current = idx;
    setTtsRateIdx(idx);
    setShowTTSMenu(false);
    if (isTTS) Speech.stop(); // loop picks up next verse at new rate
  }

  return {
    isTTS,
    ttsVerse,
    ttsRateIdx,
    showTTSMenu,
    setShowTTSMenu,
    ttsRef,
    startTTS,
    stopTTS,
    toggleTTS,
    selectTTSRate,
  };
}

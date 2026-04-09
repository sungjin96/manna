import { useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

export const TTS_RATES = [0.75, 0.9, 1.1, 1.3];
export const TTS_RATE_LABELS = ['0.75×', '1×', '1.25×', '1.5×'];

// Resolve the best available Korean voice identifier once at runtime.
// Returns the voice identifier string, or null if no Korean voice is installed.
let _koVoiceResolved = false;
let _koVoiceId: string | null = null;

async function getKoreanVoiceId(): Promise<string | null> {
  if (_koVoiceResolved) return _koVoiceId;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    // Prefer Enhanced quality, then any ko-KR voice
    const ko = voices.filter(v => v.language?.startsWith('ko'));
    const enhanced = ko.find(v => v.quality === 'Enhanced');
    _koVoiceId = (enhanced ?? ko[0])?.identifier ?? null;
  } catch {
    _koVoiceId = null;
  }
  _koVoiceResolved = true;
  return _koVoiceId;
}

export function useTTS(verses: Array<{ verse: number; text: string }> | null | undefined) {
  const [isTTS, setIsTTS] = useState(false);
  const [ttsVerse, setTtsVerse] = useState<number | null>(null);
  const [ttsRateIdx, setTtsRateIdx] = useState(1);
  const [showTTSMenu, setShowTTSMenu] = useState(false);
  const [noKoreanVoice, setNoKoreanVoice] = useState(false);

  const ttsRef = useRef({ cancel: false });
  const ttsRateIdxRef = useRef(1);

  // Pre-resolve Korean voice on mount so startTTS() doesn't stall
  useEffect(() => {
    getKoreanVoiceId().then(id => {
      if (!id) setNoKoreanVoice(true);
    });
  }, []);

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

    const voiceId = await getKoreanVoiceId();

    for (let i = 0; i < verses.length; i++) {
      if (ttsRef.current.cancel) break;
      setTtsVerse(verses[i].verse);
      const rate = TTS_RATES[ttsRateIdxRef.current];
      await new Promise<void>(resolve => {
        const options: Speech.SpeechOptions = {
          rate,
          useApplicationAudioSession: false, // bypass ringer/silent mode on iOS
          onDone: resolve,
          onStopped: resolve,
          onError: () => { ttsRef.current.cancel = true; resolve(); },
        };
        // Use resolved voice identifier; fall back to language hint only
        if (voiceId) {
          options.voice = voiceId;
        } else {
          options.language = 'ko-KR';
        }
        Speech.speak(verses[i].text, options);
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
    noKoreanVoice,
    setShowTTSMenu,
    ttsRef,
    startTTS,
    stopTTS,
    toggleTTS,
    selectTTSRate,
  };
}

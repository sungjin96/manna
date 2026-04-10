import { useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import { getSetting, setSetting } from '../db/settings';

export const TTS_RATES = [0.75, 0.9, 1.1, 1.3];
export const TTS_RATE_LABELS = ['0.75×', '1×', '1.25×', '1.5×'];

export interface TTSVoice {
  identifier: string;
  name: string;
  quality: string;
}

// Cache Korean voices list
let _koVoicesResolved = false;
let _koVoices: TTSVoice[] = [];

async function getKoreanVoices(): Promise<TTSVoice[]> {
  if (_koVoicesResolved) return _koVoices;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    _koVoices = voices
      .filter(v => v.language?.startsWith('ko'))
      .map(v => ({
        identifier: v.identifier,
        name: v.name ?? v.identifier.split('.').pop() ?? 'Unknown',
        quality: (v as { quality?: string }).quality ?? 'Default',
      }));
    // Enhanced quality first
    _koVoices.sort((a, b) => {
      if (a.quality === 'Enhanced' && b.quality !== 'Enhanced') return -1;
      if (b.quality === 'Enhanced' && a.quality !== 'Enhanced') return 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    _koVoices = [];
  }
  _koVoicesResolved = true;
  return _koVoices;
}

export function useTTS(verses: Array<{ verse: number; text: string }> | null | undefined) {
  const [isTTS, setIsTTS] = useState(false);
  const [ttsVerse, setTtsVerse] = useState<number | null>(null);
  const [ttsRateIdx, setTtsRateIdx] = useState(1);
  const [showTTSMenu, setShowTTSMenu] = useState(false);
  const [noKoreanVoice, setNoKoreanVoice] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);

  const ttsRef = useRef({ cancel: false });
  const ttsRateIdxRef = useRef(1);
  const selectedVoiceRef = useRef<string | null>(null);

  // Load voices + saved preference on mount
  useEffect(() => {
    (async () => {
      const voices = await getKoreanVoices();
      setAvailableVoices(voices);
      if (voices.length === 0) {
        setNoKoreanVoice(true);
        return;
      }
      const savedId = await getSetting('tts_voice_id', '');
      const match = savedId && voices.find(v => v.identifier === savedId);
      const voiceId = match ? savedId : voices[0].identifier;
      setSelectedVoiceId(voiceId);
      selectedVoiceRef.current = voiceId;
    })();
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

    for (let i = 0; i < verses.length; i++) {
      if (ttsRef.current.cancel) break;
      setTtsVerse(verses[i].verse);
      const rate = TTS_RATES[ttsRateIdxRef.current];
      await new Promise<void>(resolve => {
        const options: Speech.SpeechOptions = {
          rate,
          useApplicationAudioSession: false,
          onDone: resolve,
          onStopped: resolve,
          onError: () => { ttsRef.current.cancel = true; resolve(); },
        };
        if (selectedVoiceRef.current) {
          options.voice = selectedVoiceRef.current;
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
    if (isTTS) Speech.stop();
  }

  async function selectVoice(identifier: string) {
    setSelectedVoiceId(identifier);
    selectedVoiceRef.current = identifier;
    await setSetting('tts_voice_id', identifier);
    if (isTTS) Speech.stop();
  }

  return {
    isTTS,
    ttsVerse,
    ttsRateIdx,
    showTTSMenu,
    noKoreanVoice,
    availableVoices,
    selectedVoiceId,
    setShowTTSMenu,
    ttsRef,
    startTTS,
    stopTTS,
    toggleTTS,
    selectTTSRate,
    selectVoice,
  };
}

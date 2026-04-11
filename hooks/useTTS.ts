import { useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import { getSetting, setSetting } from '../db/settings';

export const TTS_RATES = [0.75, 0.9, 1.1, 1.3];
export const TTS_RATE_LABELS = ['0.75×', '1×', '1.25×', '1.5×'];
export const TTS_TIMER_PRESETS = [5, 10, 15, 20, 30, 45, 60, 90, 120]; // minutes
export const TTS_TIMER_MIN = 1;
export const TTS_TIMER_MAX = 240;

export interface TTSVoice {
  identifier: string;
  name: string;
  quality: string;
}

export interface TTSOptions {
  onChapterEnd?: () => void;
  onAutoAdvance?: () => void;
  onVerseRead?: (verseNumber: number) => void;
}

// Cache Korean voices list
let _koVoicesResolved = false;
let _koVoices: TTSVoice[] = [];

// Timer end time persists across chapter navigation (component remount)
let _globalTimerEndMs: number | null = null;

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
    // Yuna 최우선, Enhanced 차순위, 알파벳순
    _koVoices.sort((a, b) => {
      const aYuna = a.name.toLowerCase().includes('yuna');
      const bYuna = b.name.toLowerCase().includes('yuna');
      if (aYuna && !bYuna) return -1;
      if (bYuna && !aYuna) return 1;
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

export function useTTS(
  verses: Array<{ verse: number; text: string }> | null | undefined,
  options?: TTSOptions,
) {
  const [isTTS, setIsTTS] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [ttsVerse, setTtsVerse] = useState<number | null>(null);
  const [ttsRateIdx, setTtsRateIdx] = useState(1);
  const [noKoreanVoice, setNoKoreanVoice] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);

  // Timer state
  const [timerMinutes, setTimerMinutes] = useState<number | null>(null);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);

  // Settings
  const [autoCompleteEnabled, setAutoCompleteEnabled] = useState(true);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(false);
  const [pauseEnabled, setPauseEnabled] = useState(true);
  const [verseReadEnabled, setVerseReadEnabled] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Refs for use inside async loops
  const ttsRateIdxRef = useRef(1);
  const selectedVoiceRef = useRef<string | null>(null);
  const sessionRef = useRef(0);
  const currentVerseIdxRef = useRef(0);
  const timerStoppedRef = useRef(false);
  const autoCompleteRef = useRef(true);
  const autoAdvanceRef = useRef(false);
  const verseReadRef = useRef(true);
  const optionsRef = useRef(options);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  optionsRef.current = options;

  // Keep setting refs in sync
  useEffect(() => { autoCompleteRef.current = autoCompleteEnabled; }, [autoCompleteEnabled]);
  useEffect(() => { autoAdvanceRef.current = autoAdvanceEnabled; }, [autoAdvanceEnabled]);
  useEffect(() => { verseReadRef.current = verseReadEnabled; }, [verseReadEnabled]);

  // Load voices + saved settings on mount
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

    (async () => {
      const autoComplete = await getSetting('tts_auto_complete', '1');
      const autoAdvance = await getSetting('tts_auto_advance', '0');
      const pauseEn = await getSetting('tts_pause_enabled', '1');
      const verseRead = await getSetting('tts_verse_read', '1');
      const rateIdx = await getSetting('tts_rate_idx', '1');
      setAutoCompleteEnabled(autoComplete === '1');
      setAutoAdvanceEnabled(autoAdvance === '1');
      setPauseEnabled(pauseEn === '1');
      setVerseReadEnabled(verseRead === '1');
      const rateIdxNum = Math.min(3, Math.max(0, parseInt(rateIdx as string, 10) || 1));
      setTtsRateIdx(rateIdxNum);
      ttsRateIdxRef.current = rateIdxNum;
      autoCompleteRef.current = autoComplete === '1';
      autoAdvanceRef.current = autoAdvance === '1';
      verseReadRef.current = verseRead === '1';
      setSettingsLoaded(true);
    })();
  }, []);

  // Resume timer if one was active during chapter navigation
  useEffect(() => {
    if (_globalTimerEndMs !== null) {
      const remainingSecs = Math.round((_globalTimerEndMs - Date.now()) / 1000);
      if (remainingSecs > 0) {
        setTimerMinutes(Math.ceil(remainingSecs / 60));
        setTimerRemaining(remainingSecs);
        _runTimerFromSeconds(remainingSecs);
      } else {
        _globalTimerEndMs = null;
      }
    }
  }, []);

  // Cleanup on unmount — clear intervals but keep _globalTimerEndMs
  // so timer carries over to the next chapter on auto-advance
  useEffect(() => {
    return () => {
      sessionRef.current += 1; // Invalidate any running session
      Speech.stop();
      clearTimer(); // Clears intervals only, NOT _globalTimerEndMs
    };
  }, []);

  // Clears JS intervals only — does NOT clear _globalTimerEndMs
  // so the timer carries over when navigating between chapters
  function clearTimer() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }

  function _runTimerFromSeconds(totalSecs: number) {
    clearTimer();
    timerStoppedRef.current = false;
    let remaining = totalSecs;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setTimerRemaining(remaining);
      if (remaining <= 0) {
        clearTimer();
        _globalTimerEndMs = null;
        setTimerMinutes(null);
        setTimerRemaining(null);
      }
    }, 1000);
    timerRef.current = setTimeout(async () => {
      timerStoppedRef.current = true;
      _globalTimerEndMs = null;
      await _stopTTS();
    }, totalSecs * 1000);
  }

  function startTimer(minutes: number) {
    const totalSecs = minutes * 60;
    _globalTimerEndMs = Date.now() + totalSecs * 1000;
    setTimerMinutes(minutes);
    setTimerRemaining(totalSecs);
    _runTimerFromSeconds(totalSecs);
  }

  function cancelTimer() {
    clearTimer();
    _globalTimerEndMs = null;
    setTimerMinutes(null);
    setTimerRemaining(null);
  }

  async function _stopTTS() {
    sessionRef.current += 1; // Invalidate current session
    await Speech.stop();
    setIsTTS(false);
    setTtsVerse(null);
    setIsPaused(false);
  }

  async function startTTSFrom(startIdx: number) {
    if (!verses || verses.length === 0) return;
    const session = ++sessionRef.current;
    setIsTTS(true);
    setIsPaused(false);
    timerStoppedRef.current = false;

    for (let i = startIdx; i < verses.length; i++) {
      if (sessionRef.current !== session) return; // Newer session started
      currentVerseIdxRef.current = i;
      setTtsVerse(verses[i].verse);

      await new Promise<void>(resolve => {
        const opts: Speech.SpeechOptions = {
          rate: TTS_RATES[ttsRateIdxRef.current],
          useApplicationAudioSession: false,
          onDone: resolve,
          onStopped: resolve,
          onError: () => resolve(),
        };
        if (selectedVoiceRef.current) {
          opts.voice = selectedVoiceRef.current;
        } else {
          opts.language = 'ko-KR';
        }
        Speech.speak(verses[i].text, opts);
      });

      // Notify verse read (only if enabled and session still valid)
      if (sessionRef.current === session && verseReadRef.current) {
        optionsRef.current?.onVerseRead?.(verses[i].verse);
      }
    }

    if (sessionRef.current !== session) return; // Interrupted

    // All verses completed normally
    setIsTTS(false);
    setTtsVerse(null);
    setIsPaused(false);
    clearTimer();
    setTimerMinutes(null);
    setTimerRemaining(null);

    if (!timerStoppedRef.current) {
      if (autoCompleteRef.current) optionsRef.current?.onChapterEnd?.();
      if (autoAdvanceRef.current) {
        setTimeout(() => optionsRef.current?.onAutoAdvance?.(), 500);
      }
    }
  }

  function startTTS() {
    currentVerseIdxRef.current = 0;
    startTTSFrom(0);
  }

  async function startFromVerse(verseNum: number) {
    if (!verses) return;
    const idx = verses.findIndex(v => v.verse === verseNum);
    if (idx < 0) return;
    sessionRef.current += 1; // Invalidate current session
    await Speech.stop();
    startTTSFrom(idx);
  }

  async function stopTTS() {
    clearTimer();
    setTimerMinutes(null);
    setTimerRemaining(null);
    await _stopTTS();
  }

  async function pauseTTS() {
    await Speech.pause();
    setIsPaused(true);
  }

  async function resumeTTS() {
    await Speech.resume();
    setIsPaused(false);
  }

  function toggleTTS() {
    if (isTTS || isPaused) stopTTS();
    else startTTS();
  }

  function togglePause() {
    if (isPaused) resumeTTS();
    else pauseTTS();
  }

  async function skipVerse(delta: number) {
    if (!verses) return;
    const newIdx = Math.max(0, Math.min(verses.length - 1, currentVerseIdxRef.current + delta));
    sessionRef.current += 1; // Invalidate old session before stopping
    await Speech.stop();
    startTTSFrom(newIdx);
  }

  function selectTTSRate(idx: number) {
    ttsRateIdxRef.current = idx;
    setTtsRateIdx(idx);
    setSetting('tts_rate_idx', String(idx));
    if (isTTS && !isPaused) Speech.stop(); // Loop will restart next verse
  }

  async function selectVoice(identifier: string) {
    setSelectedVoiceId(identifier);
    selectedVoiceRef.current = identifier;
    await setSetting('tts_voice_id', identifier);
    if (isTTS && !isPaused) Speech.stop();
  }

  async function toggleAutoComplete() {
    const next = !autoCompleteEnabled;
    setAutoCompleteEnabled(next);
    autoCompleteRef.current = next;
    await setSetting('tts_auto_complete', next ? '1' : '0');
  }

  async function toggleAutoAdvance() {
    const next = !autoAdvanceEnabled;
    setAutoAdvanceEnabled(next);
    autoAdvanceRef.current = next;
    await setSetting('tts_auto_advance', next ? '1' : '0');
  }

  async function togglePauseEnabled() {
    const next = !pauseEnabled;
    setPauseEnabled(next);
    await setSetting('tts_pause_enabled', next ? '1' : '0');
  }

  async function toggleVerseRead() {
    const next = !verseReadEnabled;
    setVerseReadEnabled(next);
    verseReadRef.current = next;
    await setSetting('tts_verse_read', next ? '1' : '0');
  }

  return {
    isTTS,
    isPaused,
    ttsVerse,
    ttsRateIdx,
    noKoreanVoice,
    availableVoices,
    selectedVoiceId,
    timerMinutes,
    timerRemaining,
    autoCompleteEnabled,
    autoAdvanceEnabled,
    pauseEnabled,
    verseReadEnabled,
    settingsLoaded,
    startTTS,
    startFromVerse,
    stopTTS,
    pauseTTS,
    resumeTTS,
    toggleTTS,
    togglePause,
    skipVerse,
    selectTTSRate,
    selectVoice,
    startTimer,
    cancelTimer,
    toggleAutoComplete,
    toggleAutoAdvance,
    togglePauseEnabled,
    toggleVerseRead,
  };
}

/**
 * TTS orchestrator hook.
 * Tries CDN audio first (expo-audio), falls back to device TTS (expo-speech).
 * External interface is backward-compatible with the original useTTS.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';
import { getSetting, setSetting } from '../db/settings';
import { useTTSCdn } from './useTTSCdn';
import { CDN_VOICES, TTS_RATES_CDN, TTS_RATES_SPEECH, TTS_RATE_LABELS,
         TTS_TIMER_PRESETS, TTS_TIMER_MIN, TTS_TIMER_MAX } from '../constants/tts';

// Re-export constants for backward compatibility
export { TTS_RATE_LABELS, TTS_TIMER_PRESETS, TTS_TIMER_MIN, TTS_TIMER_MAX };
export const TTS_RATES = TTS_RATES_SPEECH; // legacy export

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

// Timer end time persists across chapter navigation (component remount)
let _globalTimerEndMs: number | null = null;

// Last auto-advance timestamp — persists across chapter remount to block runaway
// chains (e.g. background playback fails → didJustFinish false-positive → advance
// → new chapter fails the same way → eventually wraps to Genesis).
// Minimum realistic chapter is ~30s of audio; anything under 10s is suspicious.
let _lastAutoAdvanceMs = 0;
const AUTO_ADVANCE_MIN_GAP_MS = 10_000;

// Cache Korean voices list (for fallback mode)
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
  isProUser?: boolean,
  /** bookId + chapter needed for CDN audio lookup */
  bookId?: number,
  chapter?: number,
) {
  // --- Shared state (same interface as before) ---
  const [isTTS, setIsTTS] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [ttsVerse, setTtsVerse] = useState<number | null>(null);
  const [ttsRateIdx, setTtsRateIdx] = useState(1);
  const [noKoreanVoice, setNoKoreanVoice] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [isCdnMode, setIsCdnMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cdnReady, setCdnReady] = useState(false);

  // Timer state
  const [timerMinutes, setTimerMinutes] = useState<number | null>(null);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);

  // Settings
  const [autoCompleteEnabled, setAutoCompleteEnabled] = useState(true);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState(false);
  const [pauseEnabled, setPauseEnabled] = useState(true);
  const [verseReadEnabled, setVerseReadEnabled] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Refs
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
  const isProUserRef = useRef(!!isProUser);
  const isCdnModeRef = useRef(false);

  optionsRef.current = options;
  isProUserRef.current = !!isProUser;

  // Keep setting refs in sync
  useEffect(() => { autoCompleteRef.current = autoCompleteEnabled; }, [autoCompleteEnabled]);
  useEffect(() => { autoAdvanceRef.current = autoAdvanceEnabled; }, [autoAdvanceEnabled]);
  useEffect(() => { verseReadRef.current = verseReadEnabled; }, [verseReadEnabled]);

  // --- CDN Engine (always called — hook rules) ---
  const cdn = useTTSCdn(
    verses,
    // onVerseChange
    (verse) => {
      setTtsVerse(verse);
    },
    // onVerseRead
    (verse) => {
      if (verseReadRef.current) {
        optionsRef.current?.onVerseRead?.(verse);
      }
    },
    // onFinish
    () => {
      setIsTTS(false);
      setTtsVerse(null);
      setIsPaused(false);
      clearTimerIntervals();
      setTimerMinutes(null);
      setTimerRemaining(null);

      if (!timerStoppedRef.current) {
        if (autoCompleteRef.current) optionsRef.current?.onChapterEnd?.();
        if (autoAdvanceRef.current) {
          const now = Date.now();
          if (now - _lastAutoAdvanceMs < AUTO_ADVANCE_MIN_GAP_MS) {
            // Runaway chain guard — likely background playback never actually
            // ran (didJustFinish fired without any real playback).
            return;
          }
          _lastAutoAdvanceMs = now;
          setTimeout(() => optionsRef.current?.onAutoAdvance?.(), 500);
        }
      }
    },
    isProUser,
  );

  // --- Init: load CDN audio + device voices + settings ---
  useEffect(() => {
    (async () => {
      // Try CDN load first
      if (bookId != null && chapter != null) {
        setIsLoading(true);
        const loaded = await cdn.controls.load(bookId, chapter);
        setIsLoading(false);
        if (loaded) {
          setIsCdnMode(true);
          isCdnModeRef.current = true;
          // Build voice list from CDN voices
          setAvailableVoices(CDN_VOICES.map(v => ({
            identifier: v.id,
            name: v.label,
            quality: 'Neural',
          })));
          setSelectedVoiceId(cdn.state.cdnVoiceId);
          setNoKoreanVoice(false);
        } else {
          // Fallback: load device voices
          setIsCdnMode(false);
          isCdnModeRef.current = false;
          const voices = await getKoreanVoices();
          setAvailableVoices(voices);
          if (voices.length === 0) {
            setNoKoreanVoice(true);
          } else {
            const savedId = await getSetting('tts_voice_id', '');
            const match = savedId && voices.find(v => v.identifier === savedId);
            const voiceId = match ? savedId : voices[0].identifier;
            setSelectedVoiceId(voiceId);
            selectedVoiceRef.current = voiceId;
          }
        }
      } else {
        // No bookId/chapter — fallback only
        const voices = await getKoreanVoices();
        setAvailableVoices(voices);
        if (voices.length === 0) setNoKoreanVoice(true);
      }
      setCdnReady(true);
    })();

    // Load settings
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

  // Free users: pause on background, re-enforce pause on foreground return (prevent auto-resume)
  const pausedByBackgroundRef = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (!isProUserRef.current) {
        if (state === 'background') {
          if (isCdnModeRef.current) {
            cdn.controls.pause();
            cdn.controls.deactivateLockScreen();
          } else {
            Speech.pause();
          }
          setIsPaused(true);
          pausedByBackgroundRef.current = true;
        } else if (state === 'active' && pausedByBackgroundRef.current) {
          // Re-enforce pause in case expo-audio auto-resumed on foreground
          if (isCdnModeRef.current) cdn.controls.pause();
          else Speech.pause();
          pausedByBackgroundRef.current = false;
        }
      }
    });
    return () => subscription.remove();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionRef.current += 1;
      if (!isCdnModeRef.current) {
        Speech.stop();
      }
      // CDN: audio player is global (AudioPlayerProvider) and must NOT be torn down
      // here. Auto-advance relies on the same AVPlayer instance surviving the chapter
      // remount so iOS keeps the audio session active in the background. New chapter's
      // load() swaps audioUri in-place, replacing the source on the same player.
      clearTimerIntervals();
    };
  }, []);

  // ========== Timer logic (shared, engine-independent) ==========

  function clearTimerIntervals() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }

  function _runTimerFromSeconds(totalSecs: number) {
    clearTimerIntervals();
    timerStoppedRef.current = false;
    let remaining = totalSecs;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setTimerRemaining(remaining);
      if (remaining <= 0) {
        clearTimerIntervals();
        _globalTimerEndMs = null;
        setTimerMinutes(null);
        setTimerRemaining(null);
      }
    }, 1000);
    timerRef.current = setTimeout(async () => {
      timerStoppedRef.current = true;
      _globalTimerEndMs = null;
      await _stopAll();
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
    clearTimerIntervals();
    _globalTimerEndMs = null;
    setTimerMinutes(null);
    setTimerRemaining(null);
  }

  // ========== Playback controls ==========

  async function _stopAll() {
    if (isCdnModeRef.current) {
      cdn.controls.stop();
    } else {
      sessionRef.current += 1;
      await Speech.stop();
    }
    setIsTTS(false);
    setTtsVerse(null);
    setIsPaused(false);
  }

  // --- Speech engine functions (fallback) ---

  async function _speechStartFrom(startIdx: number) {
    if (!verses || verses.length === 0) return;
    const session = ++sessionRef.current;
    setIsTTS(true);
    setIsPaused(false);
    timerStoppedRef.current = false;

    // Session always allows background; free-user background pause is enforced
    // at the JS level by the AppState handler (see effect below).
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });

    for (let i = startIdx; i < verses.length; i++) {
      if (sessionRef.current !== session) return;
      currentVerseIdxRef.current = i;
      setTtsVerse(verses[i].verse);

      await new Promise<void>(resolve => {
        const opts: Speech.SpeechOptions = {
          rate: TTS_RATES_SPEECH[ttsRateIdxRef.current],
          useApplicationAudioSession: true,
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

      if (sessionRef.current === session && verseReadRef.current) {
        optionsRef.current?.onVerseRead?.(verses[i].verse);
      }
    }

    if (sessionRef.current !== session) return;

    setIsTTS(false);
    setTtsVerse(null);
    setIsPaused(false);
    clearTimerIntervals();
    setTimerMinutes(null);
    setTimerRemaining(null);

    if (!timerStoppedRef.current) {
      if (autoCompleteRef.current) optionsRef.current?.onChapterEnd?.();
      if (autoAdvanceRef.current) {
        const now = Date.now();
        if (now - _lastAutoAdvanceMs < AUTO_ADVANCE_MIN_GAP_MS) return;
        _lastAutoAdvanceMs = now;
        setTimeout(() => optionsRef.current?.onAutoAdvance?.(), 500);
      }
    }
  }

  // --- Public API (delegates to CDN or Speech) ---

  async function startTTS() {
    if (isCdnModeRef.current) {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
      setIsTTS(true);
      setIsPaused(false);
      timerStoppedRef.current = false;
      cdn.controls.play();
    } else {
      currentVerseIdxRef.current = 0;
      _speechStartFrom(0);
    }
  }

  async function startFromVerse(verseNum: number) {
    if (!verses) return;
    if (isCdnModeRef.current) {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      });
      setIsTTS(true);
      setIsPaused(false);
      timerStoppedRef.current = false;
      cdn.controls.playFromVerse(verseNum);
    } else {
      const idx = verses.findIndex(v => v.verse === verseNum);
      if (idx < 0) return;
      sessionRef.current += 1;
      await Speech.stop();
      _speechStartFrom(idx);
    }
  }

  async function stopTTS() {
    cancelTimer();
    await _stopAll();
  }

  async function pauseTTS() {
    if (isCdnModeRef.current) {
      cdn.controls.pause();
    } else {
      await Speech.pause();
    }
    setIsPaused(true);
  }

  async function resumeTTS() {
    if (isCdnModeRef.current) {
      cdn.controls.resume();
    } else {
      await Speech.resume();
    }
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
    if (isCdnModeRef.current) {
      cdn.controls.skipVerse(delta);
    } else {
      const newIdx = Math.max(0, Math.min(verses.length - 1, currentVerseIdxRef.current + delta));
      sessionRef.current += 1;
      await Speech.stop();
      _speechStartFrom(newIdx);
    }
  }

  function selectTTSRate(idx: number) {
    ttsRateIdxRef.current = idx;
    setTtsRateIdx(idx);
    setSetting('tts_rate_idx', String(idx));

    if (isCdnModeRef.current) {
      cdn.controls.setRate(idx);
    } else {
      if (isTTS && !isPaused) Speech.stop();
    }
  }

  async function selectVoice(identifier: string) {
    setSelectedVoiceId(identifier);

    if (isCdnModeRef.current) {
      const wasPlaying = isTTS && !isPaused;
      const wasPaused = isTTS && isPaused;
      const currentVerse = cdn.state.currentVerse;

      // Save voice preference
      await cdn.controls.selectVoice(identifier);
      selectedVoiceRef.current = identifier;

      // Reload with new voice if bookId/chapter available
      if (bookId != null && chapter != null) {
        // Schedule auto-resume if was playing or paused
        if ((wasPlaying || wasPaused) && currentVerse) {
          cdn.controls.scheduleResume(currentVerse, wasPlaying);
          await setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: 'doNotMix',
          });
        }

        // Load new voice (useAudioPlayer auto-releases old player)
        setIsLoading(true);
        await cdn.controls.load(bookId, chapter, identifier);
        setIsLoading(false);
        // playback will auto-resume via pendingResumeVerse useEffect in useTTSCdn
      }
    } else {
      selectedVoiceRef.current = identifier;
      await setSetting('tts_voice_id', identifier);
      if (isTTS && !isPaused) Speech.stop();
    }
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
    // Original interface
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
    // New fields
    isCdnMode,
    isLoading,
    cdnReady,
  };
}

/**
 * CDN-based TTS engine using expo-audio.
 * Plays pre-generated audio from Cloudflare R2 with verse-level timestamp tracking.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ensureChapterAudio } from '../lib/ttsCache';
import { CDN_VOICES, TTS_RATES_CDN } from '../constants/tts';
import { BOOKS } from '../constants/books';
import type { ChapterTimestamps, VerseTimestamp } from '../lib/ttsTypes';
import { getSetting, setSetting } from '../db/settings';

export interface CdnEngineState {
  isReady: boolean;       // audio loaded and playable
  isLoading: boolean;     // downloading from CDN
  isPlaying: boolean;
  isPaused: boolean;
  currentVerse: number | null;
  cdnVoiceId: string;     // "male" | "female"
}

export interface CdnEngineControls {
  load: (bookId: number, chapter: number, overrideVoiceId?: string) => Promise<boolean>;
  play: () => void;
  playFromVerse: (verseNum: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skipVerse: (delta: number) => void;
  setRate: (rateIdx: number) => void;
  selectVoice: (voiceId: string) => Promise<void>;
  scheduleResume: (verseNum: number, autoPlay?: boolean) => void;
  deactivateLockScreen: () => void;
}

/**
 * Hook that manages CDN audio playback with verse tracking.
 * Must be called at component top level (uses useAudioPlayer internally).
 */
export function useTTSCdn(
  verses: Array<{ verse: number; text: string }> | null | undefined,
  onVerseChange?: (verse: number) => void,
  onVerseRead?: (verse: number) => void,
  onFinish?: () => void,
  isProUser?: boolean,
) {
  const isProUserRef = useRef(!!isProUser);
  isProUserRef.current = !!isProUser;
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentVerse, setCurrentVerse] = useState<number | null>(null);
  const [cdnVoiceId, setCdnVoiceId] = useState('wavenet-d');
  const [audioUri, setAudioUri] = useState<string | null>(null);

  const timestampsRef = useRef<ChapterTimestamps | null>(null);
  const prevVerseRef = useRef<number | null>(null);
  const loadedBookIdRef = useRef<number | null>(null);
  const loadedChapterRef = useRef<number | null>(null);
  const versesRef = useRef(verses);
  versesRef.current = verses;

  const onVerseChangeRef = useRef(onVerseChange);
  onVerseChangeRef.current = onVerseChange;
  const onVerseReadRef = useRef(onVerseRead);
  onVerseReadRef.current = onVerseRead;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const rateIdxRef = useRef(1);
  const activeRef = useRef(false); // true when user initiated playback
  const pendingResumeVerseRef = useRef<number | null>(null); // auto-resume after voice change
  const pendingResumeAutoPlayRef = useRef(true); // true = play, false = seek only (paused)

  // Create audio player — source changes when audioUri changes
  const player = useAudioPlayer(audioUri, { updateInterval: 150 });
  const status = useAudioPlayerStatus(player);

  // Load saved voice preference
  useEffect(() => {
    (async () => {
      const savedVoice = await getSetting('tts_cdn_voice_id', 'wavenet-d');
      if (CDN_VOICES.find(v => v.id === savedVoice)) {
        setCdnVoiceId(savedVoice as string);
      }
    })();
  }, []);

  // Track verse position from playback status
  // Marks ALL verses between previous and current position as read (no skips)
  const lastPosSec = useRef(0);
  useEffect(() => {
    if (!activeRef.current || !status.isLoaded || !status.playing) return;
    const ts = timestampsRef.current;
    if (!ts) return;

    const posSec = status.currentTime;
    const prevPos = lastPosSec.current;
    lastPosSec.current = posSec;

    // Find current verse for highlighting
    const found = ts.verses.find(
      (v: VerseTimestamp) => posSec >= v.startSec && posSec < v.endSec,
    );

    // Mark all verses that were passed since last update as read
    if (posSec > prevPos) {
      for (const v of ts.verses) {
        // Verse was passed if its end is between prevPos and current position
        if (v.endSec > prevPos && v.endSec <= posSec && v.verse !== found?.verse) {
          onVerseReadRef.current?.(v.verse);
        }
      }
    }

    if (found && found.verse !== prevVerseRef.current) {
      // Mark previous verse as read
      if (prevVerseRef.current != null) {
        onVerseReadRef.current?.(prevVerseRef.current);
      }
      prevVerseRef.current = found.verse;
      setCurrentVerse(found.verse);
      onVerseChangeRef.current?.(found.verse);
    }
  }, [status.currentTime, status.isLoaded, status.playing]);

  // Auto-resume after voice change: when new player is loaded, resume from pending verse
  useEffect(() => {
    if (pendingResumeVerseRef.current != null && status.isLoaded && status.duration > 0 && isReady) {
      const verseNum = pendingResumeVerseRef.current;
      const shouldAutoPlay = pendingResumeAutoPlayRef.current;
      pendingResumeVerseRef.current = null;
      const ts = timestampsRef.current;
      if (ts) {
        const vts = ts.verses.find((v: VerseTimestamp) => v.verse === verseNum);
        if (vts) {
          activeRef.current = true;
          prevVerseRef.current = verseNum;
          setCurrentVerse(verseNum);
          activateLockScreen();
          try {
            player.seekTo(vts.startSec);
            player.setPlaybackRate(TTS_RATES_CDN[rateIdxRef.current]);
            if (shouldAutoPlay) {
              player.play();
            }
          } catch { /* player not ready yet */ }
        }
      }
    }
  }, [status.isLoaded, isReady, player]);

  // Handle playback finish
  useEffect(() => {
    if (!activeRef.current) return;
    if (pendingResumeVerseRef.current != null) return; // voice switch in progress
    if (status.didJustFinish) {
      // Mark last verse as read
      if (prevVerseRef.current != null) {
        onVerseReadRef.current?.(prevVerseRef.current);
      }
      activeRef.current = false;
      setCurrentVerse(null);
      prevVerseRef.current = null;
      onFinishRef.current?.();
    }
  }, [status.didJustFinish]);

  const load = useCallback(async (bookId: number, chapter: number, overrideVoiceId?: string): Promise<boolean> => {
    const voiceId = overrideVoiceId ?? cdnVoiceId;
    const voice = CDN_VOICES.find(v => v.id === voiceId) ?? CDN_VOICES[0];
    setIsLoading(true);
    setIsReady(false);

    try {
      const result = await ensureChapterAudio(voice.dirName, bookId, chapter);
      if (!result) {
        setIsLoading(false);
        return false;
      }

      timestampsRef.current = result.timestamps;
      loadedBookIdRef.current = bookId;
      loadedChapterRef.current = chapter;
      setAudioUri(result.audioUri);
      setIsReady(true);
      setIsLoading(false);
      return true;
    } catch {
      setIsLoading(false);
      return false;
    }
  }, [cdnVoiceId]);

  function activateLockScreen() {
    if (!isProUserRef.current) return;
    const bookName = BOOKS.find(b => b.id === loadedBookIdRef.current)?.name ?? '';
    const ch = loadedChapterRef.current ?? 1;
    try {
      player.setActiveForLockScreen(true, {
        title: `${bookName} ${ch}장`,
        artist: '만나 - 매일의 양식',
        artworkUrl: 'https://pub-877736ec16c9434095c2c0a7563b2b0a.r2.dev/icon.png',
      }, {
        showSeekForward: true,
        showSeekBackward: true,
      });
    } catch { /* player may not be ready */ }
  }

  const play = useCallback(() => {
    if (!isReady) return;
    activeRef.current = true;
    prevVerseRef.current = null;
    activateLockScreen();
    player.seekTo(0);
    player.setPlaybackRate(TTS_RATES_CDN[rateIdxRef.current]);
    player.play();
  }, [isReady, player]);

  const playFromVerse = useCallback((verseNum: number) => {
    if (!isReady) return;
    const ts = timestampsRef.current;
    if (!ts) return;
    const vts = ts.verses.find((v: VerseTimestamp) => v.verse === verseNum);
    if (!vts) return;

    activeRef.current = true;
    prevVerseRef.current = null;
    activateLockScreen();
    player.seekTo(vts.startSec);
    player.setPlaybackRate(TTS_RATES_CDN[rateIdxRef.current]);
    player.play();
  }, [isReady, player]);

  const pause = useCallback(() => {
    try { player.pause(); } catch { /* released */ }
  }, [player]);

  const resume = useCallback(() => {
    try { player.play(); } catch { /* released */ }
  }, [player]);

  const stop = useCallback(() => {
    activeRef.current = false;
    try {
      player.setActiveForLockScreen(false);
      player.pause();
      player.seekTo(0);
    } catch {
      // Player may already be released on unmount
    }
    setCurrentVerse(null);
    prevVerseRef.current = null;
  }, [player]);

  const deactivateLockScreen = useCallback(() => {
    try { player.setActiveForLockScreen(false); } catch { /* player may not be ready */ }
  }, [player]);

  const skipVerse = useCallback((delta: number) => {
    const ts = timestampsRef.current;
    if (!ts || !versesRef.current) return;
    const curIdx = ts.verses.findIndex((v: VerseTimestamp) => v.verse === prevVerseRef.current);
    const newIdx = Math.max(0, Math.min(ts.verses.length - 1, curIdx + delta));
    const target = ts.verses[newIdx];
    if (target) {
      try { player.seekTo(target.startSec); } catch { /* released */ }
      prevVerseRef.current = null;
    }
  }, [player]);

  const setRate = useCallback((rateIdx: number) => {
    rateIdxRef.current = rateIdx;
    try { player.setPlaybackRate(TTS_RATES_CDN[rateIdx]); } catch { /* released */ }
  }, [player]);

  const selectVoice = useCallback(async (voiceId: string) => {
    setCdnVoiceId(voiceId);
    await setSetting('tts_cdn_voice_id', voiceId);
  }, []);

  /** Schedule auto-resume from a specific verse after next load completes. */
  const scheduleResume = useCallback((verseNum: number, autoPlay: boolean = true) => {
    pendingResumeVerseRef.current = verseNum;
    pendingResumeAutoPlayRef.current = autoPlay;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
    };
  }, []);

  const state: CdnEngineState = {
    isReady,
    isLoading,
    isPlaying: activeRef.current && status.playing,
    isPaused: activeRef.current && !status.playing && status.currentTime > 0,
    currentVerse,
    cdnVoiceId,
  };

  const controls: CdnEngineControls = {
    load,
    play,
    playFromVerse,
    pause,
    resume,
    stop,
    skipVerse,
    setRate,
    selectVoice,
    scheduleResume,
    deactivateLockScreen,
  };

  return { state, controls, player };
}

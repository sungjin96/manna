/**
 * CDN-based TTS engine using expo-audio.
 * Plays pre-generated audio from Cloudflare R2 with verse-level timestamp tracking.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ensureChapterAudio, chapterCdnUrls } from '../lib/ttsCache';
import { CDN_VOICES, TTS_RATES_CDN } from '../constants/tts';
import { BOOKS } from '../constants/books';
import type { ChapterTimestamps, VerseTimestamp } from '../lib/ttsTypes';
import { getSetting, setSetting } from '../db/settings';
import { useAudioPlayerContext } from '../contexts/AudioPlayerContext';

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
/** Calls a player method and swallows both sync throws and async rejections. */
function safePlayer(fn: () => unknown) {
  try {
    const r = fn();
    if (r != null && typeof (r as Promise<unknown>).catch === 'function') {
      (r as Promise<unknown>).catch(() => {});
    }
  } catch {}
}

export function useTTSCdn(
  verses: Array<{ verse: number; text: string }> | null | undefined,
  onVerseChange?: (verse: number) => void,
  onVerseRead?: (verse: number) => void,
  onFinish?: () => void,
  isProUser?: boolean,
) {
  const isProUserRef = useRef(!!isProUser);
  isProUserRef.current = !!isProUser;
  const mountedRef = useRef(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentVerse, setCurrentVerse] = useState<number | null>(null);
  const [cdnVoiceId, setCdnVoiceId] = useState('wavenet-d');
  const cdnVoiceIdRef = useRef('wavenet-d');

  // Global audio player — survives chapter remounts to preserve iOS session.
  const { player, status, audioUri, setAudioUri } = useAudioPlayerContext();

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
  const pendingPlayRef = useRef(false); // deferred play: fires when player isLoaded
  const pendingPlayVerseRef = useRef<number | null>(null); // null = from start, N = from verse N
  // Set to true whenever player.replace() is called (via setAudioUri in load()).
  // updateInterval=1000ms means status.isLoaded can lag up to 1s behind native state.
  // play() must not trust statusRef.current.isLoaded until the new source confirms
  // isLoaded=true — otherwise it calls player.play() on a not-yet-ready source,
  // which triggers an immediate didJustFinish false-positive.
  const sourceReplacedRef = useRef(false);

  const statusRef = useRef(status); // stable ref for status (accessible in callbacks)
  statusRef.current = status;

  // Load saved voice preference
  useEffect(() => {
    (async () => {
      const savedVoice = await getSetting('tts_cdn_voice_id', 'wavenet-d');
      if (CDN_VOICES.find(v => v.id === savedVoice)) {
        setCdnVoiceId(savedVoice as string);
        cdnVoiceIdRef.current = savedVoice as string;
      }
    })();
  }, []);


  // Track verse position from playback status
  // Marks ALL verses between previous and current position as read (no skips)
  const lastPosSec = useRef(0);
  useEffect(() => {
    if (!mountedRef.current || !activeRef.current || !status.isLoaded || !status.playing) return;

    const posSec = status.currentTime;
    const prevPos = lastPosSec.current;
    lastPosSec.current = posSec;

    // In background, skip all verse tracking callbacks. The native AVPlayer
    // continues uninterrupted; didJustFinish handles chapter auto-advance.
    // This eliminates recurring JS work in background.
    // Verses played in background are bulk-marked when the chapter finishes.
    if (AppState.currentState !== 'active') return;

    const ts = timestampsRef.current;
    if (!ts) return;

    const found = ts.verses.find(
      (v: VerseTimestamp) => posSec >= v.startSec && posSec < v.endSec,
    );

    if (posSec > prevPos) {
      for (const v of ts.verses) {
        if (v.endSec > prevPos && v.endSec <= posSec && v.verse !== found?.verse) {
          onVerseReadRef.current?.(v.verse);
        }
      }
    }

    if (found && found.verse !== prevVerseRef.current) {
      console.log(`[TTS CDN] verse ${prevVerseRef.current} → ${found.verse} pos=${posSec.toFixed(1)}s`);
      if (prevVerseRef.current != null) {
        onVerseReadRef.current?.(prevVerseRef.current);
      }
      prevVerseRef.current = found.verse;
      setCurrentVerse(found.verse);
      onVerseChangeRef.current?.(found.verse);
      console.log(`[TTS CDN] verse ${found.verse} handlers done`);
    }
  }, [status.currentTime, status.isLoaded, status.playing]);

  // Deferred play: fires when player finishes loading (play() was called before isLoaded)
  useEffect(() => {
    console.log(`[TTS CDN] deferred-play check isLoaded=${status.isLoaded} duration=${status.duration.toFixed(1)} pending=${pendingPlayRef.current} active=${activeRef.current}`);
    if (!mountedRef.current || !pendingPlayRef.current || !activeRef.current) return;
    if (status.playing) return; // already playing
    if (status.isLoaded && status.duration > 0) {
      sourceReplacedRef.current = false; // new source confirmed loaded — stale guard cleared
      pendingPlayRef.current = false;
      const verseNum = pendingPlayVerseRef.current;
      pendingPlayVerseRef.current = null;
      if (verseNum != null) {
        const ts = timestampsRef.current;
        const vts = ts?.verses.find((v: VerseTimestamp) => v.verse === verseNum);
        if (vts) safePlayer(() => player.seekTo(vts.startSec));
      } else {
        safePlayer(() => player.seekTo(0));
      }
      safePlayer(() => player.setPlaybackRate(TTS_RATES_CDN[rateIdxRef.current]));
      safePlayer(() => player.play());
    }
  }, [status.isLoaded, status.duration]);

  // Auto-resume after voice change: when new player is loaded, resume from pending verse
  useEffect(() => {
    if (!mountedRef.current) return;
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
          safePlayer(() => player.seekTo(vts.startSec));
          safePlayer(() => player.setPlaybackRate(TTS_RATES_CDN[rateIdxRef.current]));
          if (shouldAutoPlay) safePlayer(() => player.play());
        }
      }
    }
  }, [status.isLoaded, isReady, player]);

  // Handle playback finish
  useEffect(() => {
    if (!mountedRef.current || !activeRef.current) return;
    if (pendingResumeVerseRef.current != null) return; // voice switch in progress
    if (status.didJustFinish) {
      console.log(`[TTS CDN] didJustFinish — prevVerse=${prevVerseRef.current} lastPos=${lastPosSec.current.toFixed(1)}s appState=${AppState.currentState}`);
      // In background, status.currentTime is frozen in the context so
      // lastPosSec never advances past ~0. Use status.duration as a fallback:
      // if the chapter had real audio loaded (duration > 1s), trust the finish.
      const playedSomething =
        prevVerseRef.current != null ||
        lastPosSec.current > 1 ||
        (AppState.currentState !== 'active' && status.duration > 1);
      if (!playedSomething) {
        return;
      }
      // In background, verse tracking was skipped entirely. Bulk-mark all
      // verses as read now so reading progress is recorded correctly.
      const ts = timestampsRef.current;
      if (AppState.currentState !== 'active' && ts) {
        for (const v of ts.verses) {
          onVerseReadRef.current?.(v.verse);
        }
      } else if (prevVerseRef.current != null) {
        onVerseReadRef.current?.(prevVerseRef.current);
      }
      activeRef.current = false;
      setCurrentVerse(null);
      prevVerseRef.current = null;
      lastPosSec.current = 0;
      onFinishRef.current?.();
    }
  }, [status.didJustFinish]);

  // Resolve the Nth chapter after a given starting point, crossing book boundaries.
  function resolveChapterAhead(startBookId: number, startChapter: number, offset: number): { bookId: number; chapter: number } | null {
    let bId = startBookId;
    let ch = startChapter + offset;
    let book = BOOKS.find(b => b.id === bId);
    while (book && ch > book.chapters) {
      ch -= book.chapters;
      bId++;
      book = BOOKS.find(b => b.id === bId);
    }
    return book ? { bookId: bId, chapter: ch } : null;
  }

  // Sliding-window prefetch: always keep the next 2 chapters cached.
  // Called on every successful load(). Since load() is also called on background
  // auto-advance (from cache), the window slides forward naturally — each chapter
  // advance prefetches one more chapter ahead, so the buffer never depletes.
  // Downloads only run in foreground; cached chapters return instantly in background.
  function prefetchAhead(voiceDirName: string, fromBookId: number, fromChapter: number) {
    for (let i = 1; i <= 3; i++) {
      const target = resolveChapterAhead(fromBookId, fromChapter, i);
      if (!target) break;
      const { bookId: tBook, chapter: tCh } = target;
      ensureChapterAudio(voiceDirName, tBook, tCh)
        .then(() => console.log(`[TTS CDN] prefetch[+${i}] DONE book=${tBook} ch=${tCh}`))
        .catch(() => {});
    }
  }

  const load = useCallback(async (bookId: number, chapter: number, overrideVoiceId?: string): Promise<boolean> => {
    const voiceId = overrideVoiceId ?? cdnVoiceId;
    const voice = CDN_VOICES.find(v => v.id === voiceId) ?? CDN_VOICES[0];
    console.log(`[TTS CDN] load() START bookId=${bookId} chapter=${chapter} appState=${AppState.currentState}`);
    setIsLoading(true);
    setIsReady(false);

    try {
      const result = await ensureChapterAudio(voice.dirName, bookId, chapter);

      let audioUri: string;
      if (result) {
        // Cache hit or foreground download succeeded — use local file.
        // Local files load almost instantly in AVPlayer, so status.isLoaded reflects
        // the new source quickly. No need for sourceReplacedRef guard.
        console.log(`[TTS CDN] load() SUCCESS (local) bookId=${bookId} chapter=${chapter}`);
        timestampsRef.current = result.timestamps;
        audioUri = result.audioUri;
      } else if (AppState.currentState !== 'active') {
        // Background + cache miss — stream directly from CDN.
        // AVPlayer buffers the remote URL async (seconds), so status.isLoaded will be
        // stale (showing the previous chapter's true) when play() is called.
        // sourceReplacedRef=true forces play() to defer until the stream is actually ready.
        console.log(`[TTS CDN] load() STREAM (background) bookId=${bookId} chapter=${chapter} — fetching JSON`);
        const urls = chapterCdnUrls(voice.dirName, bookId, chapter);
        try {
          const res = await fetch(urls.json);
          if (res.ok) {
            timestampsRef.current = await res.json();
            console.log(`[TTS CDN] STREAM JSON ok bookId=${bookId} chapter=${chapter}`);
          } else {
            console.log(`[TTS CDN] STREAM JSON fail status=${res.status} bookId=${bookId} chapter=${chapter}`);
            timestampsRef.current = null;
          }
        } catch (e) {
          console.log(`[TTS CDN] STREAM JSON error bookId=${bookId} chapter=${chapter} err=${e}`);
          timestampsRef.current = null;
        }
        console.log(`[TTS CDN] STREAM calling player.replace url=${urls.mp3.slice(-40)}`);
        sourceReplacedRef.current = true; // stale-status guard: force deferred play
        audioUri = urls.mp3;
      } else {
        console.log(`[TTS CDN] load() FAIL (no audio) bookId=${bookId} chapter=${chapter}`);
        setIsLoading(false);
        return false;
      }

      loadedBookIdRef.current = bookId;
      loadedChapterRef.current = chapter;
      setAudioUri(audioUri);
      setIsReady(true);
      setIsLoading(false);

      // Sliding-window prefetch — called on every successful load (foreground or background).
      // In foreground: actually downloads the next 2 chapters.
      // In background: returns instantly for already-cached chapters, skips downloads.
      // Net effect: as each chapter advances, the cache window slides forward by 1,
      // so the buffer never shrinks to zero as long as the user occasionally returns
      // to foreground.
      prefetchAhead(voice.dirName, bookId, chapter);

      return true;
    } catch {
      setIsLoading(false);
      return false;
    }
  }, [cdnVoiceId, setAudioUri]);

  function activateLockScreen() {
    // Pro-only feature. isProUser race on fresh mount is avoided by caching
    // the entitlement in subscriptions.ts and hydrating chapter.tsx's useState
    // initial value from the cache — so after the first successful
    // checkAIEntitlement(), subsequent chapter remounts start with the correct
    // isProUser value.
    if (!isProUserRef.current) return;
    const bookName = BOOKS.find(b => b.id === loadedBookIdRef.current)?.name ?? '';
    const ch = loadedChapterRef.current ?? 1;
    safePlayer(() => player.setActiveForLockScreen(true, {
      title: `${bookName} ${ch}장`,
      artist: '만나 - 매일의 양식',
      artworkUrl: 'https://pub-877736ec16c9434095c2c0a7563b2b0a.r2.dev/icon.png',
    }, {
      showSeekForward: true,
      showSeekBackward: true,
    }));
  }

  const play = useCallback(() => {
    if (!isReady) return;
    activeRef.current = true;
    prevVerseRef.current = null;
    pendingPlayRef.current = false;
    pendingPlayVerseRef.current = null;
    activateLockScreen();
    // sourceReplacedRef guards against stale status: updateInterval=1000ms means
    // status.isLoaded can show the PREVIOUS chapter's value for up to 1s after
    // player.replace(). If we trust it and call player.play() directly, AVPlayer
    // fires didJustFinish immediately because it's playing a not-yet-ready source.
    const nativeReady = !sourceReplacedRef.current &&
      statusRef.current.isLoaded && statusRef.current.duration > 0;
    if (nativeReady) {
      safePlayer(() => player.seekTo(0));
      safePlayer(() => player.setPlaybackRate(TTS_RATES_CDN[rateIdxRef.current]));
      safePlayer(() => player.play());
    } else {
      // Defer until deferred-play effect confirms isLoaded=true for the new source.
      pendingPlayRef.current = true;
    }
  }, [isReady, player]);

  const playFromVerse = useCallback((verseNum: number) => {
    if (!isReady) return;
    const ts = timestampsRef.current;
    if (!ts) return;
    const vts = ts.verses.find((v: VerseTimestamp) => v.verse === verseNum);
    if (!vts) return;

    activeRef.current = true;
    prevVerseRef.current = null;
    pendingPlayRef.current = false;
    pendingPlayVerseRef.current = null;
    activateLockScreen();
    if (statusRef.current.isLoaded && statusRef.current.duration > 0) {
      safePlayer(() => player.seekTo(vts.startSec));
      safePlayer(() => player.setPlaybackRate(TTS_RATES_CDN[rateIdxRef.current]));
      safePlayer(() => player.play());
    } else {
      pendingPlayVerseRef.current = verseNum;
      pendingPlayRef.current = true;
    }
  }, [isReady, player]);

  const pause = useCallback(() => {
    safePlayer(() => player.pause());
  }, [player]);

  const resume = useCallback(() => {
    safePlayer(() => player.play());
  }, [player]);

  const stop = useCallback(() => {
    activeRef.current = false;
    pendingPlayRef.current = false;
    pendingPlayVerseRef.current = null;
    safePlayer(() => player.setActiveForLockScreen(false));
    safePlayer(() => player.pause());
    safePlayer(() => player.seekTo(0));
    setCurrentVerse(null);
    prevVerseRef.current = null;
  }, [player]);

  const deactivateLockScreen = useCallback(() => {
    safePlayer(() => player.setActiveForLockScreen(false));
  }, [player]);

  const skipVerse = useCallback((delta: number) => {
    const ts = timestampsRef.current;
    if (!ts || !versesRef.current) return;
    const curIdx = ts.verses.findIndex((v: VerseTimestamp) => v.verse === prevVerseRef.current);
    const newIdx = Math.max(0, Math.min(ts.verses.length - 1, curIdx + delta));
    const target = ts.verses[newIdx];
    if (target) {
      safePlayer(() => player.seekTo(target.startSec));
      prevVerseRef.current = null;
    }
  }, [player]);

  const setRate = useCallback((rateIdx: number) => {
    rateIdxRef.current = rateIdx;
    safePlayer(() => player.setPlaybackRate(TTS_RATES_CDN[rateIdx]));
  }, [player]);

  const selectVoice = useCallback(async (voiceId: string) => {
    setCdnVoiceId(voiceId);
    cdnVoiceIdRef.current = voiceId;
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
      mountedRef.current = false;
      activeRef.current = false;
      pendingPlayRef.current = false;
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

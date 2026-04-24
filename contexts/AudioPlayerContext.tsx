/**
 * Global audio player context.
 *
 * Holds a single AudioPlayer instance for the app lifetime. Source swaps use
 * player.replace() instead of recreating the player, so the native AVPlayer
 * instance and its active audio session survive chapter navigation — critical
 * for background playback to continue seamlessly into the next chapter.
 *
 * Why not useAudioPlayer? It creates a NEW AudioPlayer whenever the source
 * string changes (useReleasingSharedObject deps include JSON.stringify(source)),
 * which tears down the AVPlayer and kills the background session.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createAudioPlayer, setAudioModeAsync, useAudioPlayerStatus, type AudioPlayer, type AudioStatus } from 'expo-audio';

interface AudioPlayerContextValue {
  player: AudioPlayer;
  status: AudioStatus;
  audioUri: string | null;
  setAudioUri: (uri: string | null) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  // Lazy-create the player once; keep the same instance for the whole app lifetime.
  const playerRef = useRef<AudioPlayer | null>(null);
  if (!playerRef.current) {
    // keepAudioSessionActive: true — keep iOS AVAudioSession active even when
    // the player is idle/paused. Without this, the session deactivates after
    // a chapter ends, and the next chapter's play() in background fails to
    // re-activate the session (iOS restricts session activation from background).
    playerRef.current = createAudioPlayer(null, {
      updateInterval: 150,
      keepAudioSessionActive: true,
    });
  }
  const player = playerRef.current;

  const [audioUri, setAudioUriState] = useState<string | null>(null);

  const setAudioUri = useCallback((uri: string | null) => {
    setAudioUriState(uri);
    if (uri) {
      try {
        // Same-instance source swap — preserves the audio session so background
        // playback continues across chapter boundaries.
        player.replace(uri);
      } catch {
        // swallow native errors (e.g. during app tear-down)
      }
    }
  }, [player]);

  const status = useAudioPlayerStatus(player);

  // Configure audio session ONCE at app start. iOS doesn't like category changes
  // during active playback — repeated calls can interrupt background sessions.
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch(() => {});
  }, []);

  // Release native resources only when the provider itself unmounts (app exit).
  useEffect(() => {
    return () => {
      try {
        player.release();
      } catch {}
    };
  }, [player]);

  return (
    <AudioPlayerContext.Provider value={{ player, status, audioUri, setAudioUri }}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayerContext(): AudioPlayerContextValue {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) {
    throw new Error('useAudioPlayerContext must be used within AudioPlayerProvider');
  }
  return ctx;
}

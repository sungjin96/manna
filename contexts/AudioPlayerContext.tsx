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
import { createAudioPlayer, useAudioPlayerStatus, type AudioPlayer, type AudioStatus } from 'expo-audio';

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
    playerRef.current = createAudioPlayer(null, { updateInterval: 150 });
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

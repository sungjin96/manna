/**
 * Global audio player context.
 *
 * Holds a single AudioPlayer instance for the entire app lifetime.
 * When a user navigates between chapters (which remounts the chapter screen),
 * the player is NOT torn down. Instead, useTTSCdn swaps audioUri through this
 * context, and expo-audio replaces the source on the same native AVPlayer,
 * preserving the active audio session so background playback continues without
 * interruption.
 */

import { createContext, useContext, useState, ReactNode } from 'react';
import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer, type AudioStatus } from 'expo-audio';

interface AudioPlayerContextValue {
  player: AudioPlayer;
  status: AudioStatus;
  audioUri: string | null;
  setAudioUri: (uri: string | null) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const player = useAudioPlayer(audioUri, { updateInterval: 150 });
  const status = useAudioPlayerStatus(player);

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

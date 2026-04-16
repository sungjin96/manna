import type { CdnVoice } from '../lib/ttsTypes';

// Cloudflare R2 public URL (update after R2 setup)
export const TTS_CDN_BASE_URL = 'https://pub-877736ec16c9434095c2c0a7563b2b0a.r2.dev/v1';

// CDN voices available
export const CDN_VOICES: CdnVoice[] = [
  { id: 'wavenet-d', voiceName: 'ko-KR-Wavenet-D', label: '차분한 남성', dirName: 'wavenet-d' },
  { id: 'wavenet-c', voiceName: 'ko-KR-Wavenet-C', label: '밝은 남성', dirName: 'wavenet-c' },
  { id: 'wavenet-b', voiceName: 'ko-KR-Wavenet-B', label: '부드러운 여성', dirName: 'wavenet-b' },
];

// Playback rates — expo-audio uses actual multipliers
export const TTS_RATES_CDN = [0.75, 1.0, 1.25, 1.5];

// expo-speech rates (non-linear mapping)
export const TTS_RATES_SPEECH = [0.75, 0.9, 1.1, 1.3];

export const TTS_RATE_LABELS = ['0.75\u00d7', '1\u00d7', '1.25\u00d7', '1.5\u00d7'];

export const TTS_TIMER_PRESETS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
export const TTS_TIMER_MIN = 1;
export const TTS_TIMER_MAX = 240;

/** Shared types for the CDN-based TTS system. */

export interface VerseTimestamp {
  verse: number;
  startSec: number;
  endSec: number;
}

export interface ChapterTimestamps {
  bookId: number;
  chapter: number;
  voice: string;
  durationSec: number;
  verses: VerseTimestamp[];
}

/** CDN voice definition shown in the voice picker. */
export interface CdnVoice {
  id: string;        // e.g. "male" or "female"
  voiceName: string;  // e.g. "ko-KR-Wavenet-D"
  label: string;      // e.g. "남성" or "여성"
  dirName: string;    // R2 directory name: "male" or "female"
}

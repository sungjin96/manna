/**
 * TTS audio cache manager.
 * Downloads chapter MP3 + timestamp JSON from Cloudflare R2
 * and caches them locally using expo-file-system.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { AppState } from 'react-native';
import { TTS_CDN_BASE_URL, CDN_VOICES } from '../constants/tts';
import type { ChapterTimestamps } from './ttsTypes';

const CACHE_DIR = `${FileSystem.documentDirectory}tts-cache/`;

function pad2(n: number) { return String(n).padStart(2, '0'); }
function pad3(n: number) { return String(n).padStart(3, '0'); }

function chapterDir(voiceDirName: string, bookId: number) {
  return `${CACHE_DIR}${voiceDirName}/${pad2(bookId)}/`;
}

function mp3Path(voiceDirName: string, bookId: number, chapter: number) {
  return `${chapterDir(voiceDirName, bookId)}${pad3(chapter)}.mp3`;
}

function jsonPath(voiceDirName: string, bookId: number, chapter: number) {
  return `${chapterDir(voiceDirName, bookId)}${pad3(chapter)}.json`;
}

function cdnUrl(voiceDirName: string, bookId: number, chapter: number, ext: string) {
  return `${TTS_CDN_BASE_URL}/${voiceDirName}/${pad2(bookId)}/${pad3(chapter)}.${ext}`;
}

/** CDN URLs for a chapter — use for direct streaming when cache is unavailable. */
export function chapterCdnUrls(voiceDirName: string, bookId: number, chapter: number) {
  return {
    mp3: cdnUrl(voiceDirName, bookId, chapter, 'mp3'),
    json: cdnUrl(voiceDirName, bookId, chapter, 'json'),
  };
}

async function ensureDir(dir: string) {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/** Check if a chapter's audio is cached locally. */
export async function isChapterCached(
  voiceDirName: string, bookId: number, chapter: number,
): Promise<boolean> {
  const mp3 = await FileSystem.getInfoAsync(mp3Path(voiceDirName, bookId, chapter));
  const json = await FileSystem.getInfoAsync(jsonPath(voiceDirName, bookId, chapter));
  return mp3.exists && json.exists;
}

/** Get cached MP3 URI. Returns null if not cached. */
export async function getCachedAudioUri(
  voiceDirName: string, bookId: number, chapter: number,
): Promise<string | null> {
  const path = mp3Path(voiceDirName, bookId, chapter);
  const info = await FileSystem.getInfoAsync(path);
  return info.exists ? path : null;
}

/** Get cached timestamps. Returns null if not cached. */
export async function getCachedTimestamps(
  voiceDirName: string, bookId: number, chapter: number,
): Promise<ChapterTimestamps | null> {
  const path = jsonPath(voiceDirName, bookId, chapter);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  try {
    const content = await FileSystem.readAsStringAsync(path);
    return JSON.parse(content) as ChapterTimestamps;
  } catch {
    return null;
  }
}

/**
 * Download chapter audio + timestamps from CDN.
 * Returns { audioUri, timestamps } or throws on network error.
 */
export async function downloadChapter(
  voiceDirName: string, bookId: number, chapter: number,
): Promise<{ audioUri: string; timestamps: ChapterTimestamps }> {
  const dir = chapterDir(voiceDirName, bookId);
  await ensureDir(dir);

  const mp3Url = cdnUrl(voiceDirName, bookId, chapter, 'mp3');
  const jsonUrl = cdnUrl(voiceDirName, bookId, chapter, 'json');
  const localMp3 = mp3Path(voiceDirName, bookId, chapter);
  const localJson = jsonPath(voiceDirName, bookId, chapter);

  // Download in parallel
  const [mp3Result, jsonResult] = await Promise.all([
    FileSystem.downloadAsync(mp3Url, localMp3),
    FileSystem.downloadAsync(jsonUrl, localJson),
  ]);

  if (mp3Result.status !== 200) {
    throw new Error(`MP3 download failed: ${mp3Result.status}`);
  }
  if (jsonResult.status !== 200) {
    throw new Error(`JSON download failed: ${jsonResult.status}`);
  }

  const content = await FileSystem.readAsStringAsync(localJson);
  const timestamps = JSON.parse(content) as ChapterTimestamps;

  return { audioUri: localMp3, timestamps };
}

/**
 * Ensure chapter audio is available — use cache or download.
 * Returns { audioUri, timestamps } or null if unavailable (offline + no cache).
 */
export async function ensureChapterAudio(
  voiceDirName: string, bookId: number, chapter: number,
): Promise<{ audioUri: string; timestamps: ChapterTimestamps } | null> {
  // Check cache first
  const cachedUri = await getCachedAudioUri(voiceDirName, bookId, chapter);
  const cachedTs = await getCachedTimestamps(voiceDirName, bookId, chapter);
  if (cachedUri && cachedTs) {
    console.log(`[TTS Cache] HIT book=${bookId} ch=${chapter}`);
    return { audioUri: cachedUri, timestamps: cachedTs };
  }

  // Never download in background — downloadAsync uses foreground URLSession.
  // iOS background task gives ~30s; if download doesn't finish, iOS kills the app.
  if (AppState.currentState !== 'active') {
    return null;
  }

  // Try download
  console.log(`[TTS Cache] DOWNLOAD START book=${bookId} ch=${chapter}`);
  try {
    const result = await downloadChapter(voiceDirName, bookId, chapter);
    console.log(`[TTS Cache] DOWNLOAD DONE book=${bookId} ch=${chapter}`);
    return result;
  } catch (e) {
    console.log(`[TTS Cache] DOWNLOAD FAIL book=${bookId} ch=${chapter} err=${e}`);
    return null;
  }
}

/** Clear entire TTS cache. */
export async function clearTtsCache(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
  }
}

/** Get approximate cache size in bytes. */
export async function getTtsCacheSize(): Promise<number> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) return 0;
  // expo-file-system doesn't provide recursive size, so estimate
  // by counting files in known voice directories
  let totalSize = 0;
  for (const voice of CDN_VOICES) {
    const voiceDir = `${CACHE_DIR}${voice.dirName}/`;
    const vInfo = await FileSystem.getInfoAsync(voiceDir);
    if (vInfo.exists && vInfo.size) {
      totalSize += vInfo.size;
    }
  }
  return totalSize;
}

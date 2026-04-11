import { useCallback, useEffect, useState } from 'react';
import { getSetting, setSetting } from '../db/settings';

export type ReaderTheme = 'midnight' | 'daylight' | 'sepia' | 'forest' | 'rosegold' | 'greystone';
export type ReaderFont = 'default' | 'serif' | 'nanumMyeongjo' | 'nanumGothic' | 'nanumSquareRound';
export type HorizontalMargin = 'narrow' | 'normal' | 'wide';

export interface ReaderSettings {
  fontSize: number;            // 14–22
  lineHeight: number;          // 1.4–2.0
  theme: ReaderTheme;
  font: ReaderFont;
  letterSpacing: number;       // 0–3 (RN density-independent px, 소수점 1자리)
  horizontalMargin: HorizontalMargin;
  keepAwake: boolean;
  hideVerseNumbers: boolean;
  focusMode: boolean;          // Pro 전용
}

export interface ReaderColors {
  bg: string;
  text: string;
  surface: string;
  gold: string;
  muted: string;
  border: string;
  headerBg: string;
}

export const READER_THEMES: Record<ReaderTheme, ReaderColors> = {
  // 묵상 — 기존 dark 개선: 순백→오프화이트
  midnight: {
    bg: '#0D0C14',
    text: '#E8E4D9',
    surface: '#15131F',
    gold: '#D4A847',
    muted: 'rgba(232,228,217,0.35)',
    border: 'rgba(212,168,71,0.18)',
    headerBg: '#15131F',
  },
  // 여명 — 기존 light 개선: 순백→크림화이트
  daylight: {
    bg: '#F8F6F2',
    text: '#2C2415',
    surface: '#EEE9E0',
    gold: '#8B5E3C',
    muted: 'rgba(44,36,21,0.45)',
    border: 'rgba(139,94,60,0.20)',
    headerBg: '#EEE9E0',
  },
  // 시편 — 기존 sepia 미세 조정
  sepia: {
    bg: '#F2E8D5',
    text: '#3A2415',
    surface: '#E8DCC5',
    gold: '#8B6914',
    muted: 'rgba(58,36,21,0.45)',
    border: 'rgba(139,105,20,0.25)',
    headerBg: '#E8DCC5',
  },
  // 광야 — 초록 계열, 눈 피로 최소화
  forest: {
    bg: '#0E1A12',
    text: '#D4E8C2',
    surface: '#152212',
    gold: '#5A9B5E',
    muted: 'rgba(212,232,194,0.35)',
    border: 'rgba(90,155,94,0.20)',
    headerBg: '#152212',
  },
  // 저녁 — 따뜻한 밤 독서 분위기
  rosegold: {
    bg: '#1A0E12',
    text: '#F0D0C0',
    surface: '#22121A',
    gold: '#C47B6A',
    muted: 'rgba(240,208,192,0.35)',
    border: 'rgba(196,123,106,0.20)',
    headerBg: '#22121A',
  },
  // 실라 — 뉴트럴 다크, 오래 읽기 최적
  greystone: {
    bg: '#14151A',
    text: '#C8CACC',
    surface: '#1C1D24',
    gold: '#8090A8',
    muted: 'rgba(200,202,204,0.35)',
    border: 'rgba(128,144,168,0.20)',
    headerBg: '#1C1D24',
  },
};

// 테마 표시 이름 (UI용)
export const READER_THEME_LABELS: Record<ReaderTheme, string> = {
  midnight: '묵상',
  daylight: '여명',
  sepia: '시편',
  forest: '광야',
  rosegold: '저녁',
  greystone: '실라',
};

export const MARGIN_MAP: Record<HorizontalMargin, number> = {
  narrow: 12,
  normal: 24,
  wide: 40,
};

const VALID_THEMES = new Set<string>(Object.keys(READER_THEMES));
const VALID_FONTS = new Set<string>(['default', 'serif', 'nanumMyeongjo', 'nanumGothic', 'nanumSquareRound']);
const VALID_MARGINS = new Set<string>(['narrow', 'normal', 'wide']);

/**
 * 구 테마 키를 새 키로 마이그레이션.
 * DB에 'dark' 또는 'light'가 저장된 유저를 대응.
 * 유효하지 않은 값은 'midnight' fallback.
 */
export function migrateTheme(stored: string): ReaderTheme {
  if (stored === 'dark') return 'midnight';
  if (stored === 'light') return 'daylight';
  if (VALID_THEMES.has(stored)) return stored as ReaderTheme;
  return 'midnight';
}

const DEFAULTS: ReaderSettings = {
  fontSize: 17,
  lineHeight: 1.65,
  theme: 'midnight',
  font: 'default',
  letterSpacing: 0,
  horizontalMargin: 'normal',
  keepAwake: false,
  hideVerseNumbers: false,
  focusMode: false,
};

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      getSetting('reader_font_size', '17'),
      getSetting('reader_line_height', '165'),
      getSetting('reader_theme', 'midnight'),
      getSetting('reader_font', 'default'),
      getSetting('reader_letter_spacing', '0'),
      getSetting('reader_margin', 'normal'),
      getSetting('reader_keep_awake', '0'),
      getSetting('reader_hide_verse_numbers', '0'),
      getSetting('reader_focus_mode', '0'),
    ]).then(([fs, lh, theme, font, ls, margin, keepAwake, hideVerse, focusMode]) => {
      setSettings({
        fontSize: parseInt(fs, 10),
        lineHeight: parseInt(lh, 10) / 100,
        theme: migrateTheme(theme),
        font: VALID_FONTS.has(font) ? (font as ReaderFont) : 'default',
        letterSpacing: parseInt(ls, 10) / 10,
        horizontalMargin: VALID_MARGINS.has(margin) ? (margin as HorizontalMargin) : 'normal',
        keepAwake: keepAwake === '1',
        hideVerseNumbers: hideVerse === '1',
        focusMode: focusMode === '1',
      });
      setLoaded(true);
    });
  }, []);

  const update = useCallback((partial: Partial<ReaderSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      if (partial.fontSize !== undefined)         setSetting('reader_font_size', String(partial.fontSize));
      if (partial.lineHeight !== undefined)       setSetting('reader_line_height', String(Math.round(partial.lineHeight * 100)));
      if (partial.theme !== undefined)            setSetting('reader_theme', partial.theme);
      if (partial.font !== undefined)             setSetting('reader_font', partial.font);
      if (partial.letterSpacing !== undefined)    setSetting('reader_letter_spacing', String(Math.round(partial.letterSpacing * 10)));
      if (partial.horizontalMargin !== undefined) setSetting('reader_margin', partial.horizontalMargin);
      if (partial.keepAwake !== undefined)        setSetting('reader_keep_awake', partial.keepAwake ? '1' : '0');
      if (partial.hideVerseNumbers !== undefined) setSetting('reader_hide_verse_numbers', partial.hideVerseNumbers ? '1' : '0');
      if (partial.focusMode !== undefined)        setSetting('reader_focus_mode', partial.focusMode ? '1' : '0');
      return next;
    });
  }, []);

  return { settings, update, loaded, colors: READER_THEMES[settings.theme] };
}

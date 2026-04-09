import { useCallback, useEffect, useState } from 'react';
import { getSetting, setSetting } from '../db/settings';

export type ReaderTheme = 'dark' | 'sepia' | 'light';
export type ReaderFont = 'default' | 'serif';

export interface ReaderSettings {
  fontSize: number;       // 14–22
  lineHeight: number;     // 1.4–2.0
  theme: ReaderTheme;
  font: ReaderFont;
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
  dark: {
    bg: '#0B0A12',
    text: '#FFFFFF',
    surface: '#13111F',
    gold: '#D4A847',
    muted: 'rgba(255,255,255,0.35)',
    border: 'rgba(212,168,71,0.18)',
    headerBg: '#13111F',
  },
  sepia: {
    bg: '#F5EDD6',
    text: '#3D2B1F',
    surface: '#EDE4C8',
    gold: '#8B6914',
    muted: 'rgba(61,43,31,0.45)',
    border: 'rgba(139,105,20,0.25)',
    headerBg: '#EDE4C8',
  },
  light: {
    bg: '#FFFFFF',
    text: '#1A1A1A',
    surface: '#F0F0F0',
    gold: '#B8860B',
    muted: 'rgba(26,26,26,0.45)',
    border: 'rgba(184,134,11,0.20)',
    headerBg: '#F0F0F0',
  },
};

const DEFAULTS: ReaderSettings = {
  fontSize: 17,
  lineHeight: 1.65,
  theme: 'dark',
  font: 'default',
};

export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      getSetting('reader_font_size', '17'),
      getSetting('reader_line_height', '165'),
      getSetting('reader_theme', 'dark'),
      getSetting('reader_font', 'default'),
    ]).then(([fs, lh, theme, font]) => {
      setSettings({
        fontSize: parseInt(fs, 10),
        lineHeight: parseInt(lh, 10) / 100,
        theme: theme as ReaderTheme,
        font: font as ReaderFont,
      });
      setLoaded(true);
    });
  }, []);

  const update = useCallback((partial: Partial<ReaderSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      if (partial.fontSize !== undefined) setSetting('reader_font_size', String(partial.fontSize));
      if (partial.lineHeight !== undefined) setSetting('reader_line_height', String(Math.round(partial.lineHeight * 100)));
      if (partial.theme !== undefined) setSetting('reader_theme', partial.theme);
      if (partial.font !== undefined) setSetting('reader_font', partial.font);
      return next;
    });
  }, []);

  return { settings, update, loaded, colors: READER_THEMES[settings.theme] };
}

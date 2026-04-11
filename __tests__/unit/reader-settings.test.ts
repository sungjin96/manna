import {
  migrateTheme,
  READER_THEMES,
  READER_THEME_LABELS,
  MARGIN_MAP,
} from '../../hooks/useReaderSettings';

// ─── migrateTheme ────────────────────────────────────────────────────────────

describe('migrateTheme', () => {
  it("'dark' → 'midnight' (구 테마 마이그레이션)", () => {
    expect(migrateTheme('dark')).toBe('midnight');
  });

  it("'light' → 'daylight' (구 테마 마이그레이션)", () => {
    expect(migrateTheme('light')).toBe('daylight');
  });

  it("'sepia' → 'sepia' (그대로 유지)", () => {
    expect(migrateTheme('sepia')).toBe('sepia');
  });

  it("새 테마 키 'midnight' → 'midnight' (변환 없음)", () => {
    expect(migrateTheme('midnight')).toBe('midnight');
  });

  it("유효하지 않은 값 → 'midnight' fallback", () => {
    expect(migrateTheme('invalid_garbage')).toBe('midnight');
    expect(migrateTheme('')).toBe('midnight');
    expect(migrateTheme('DARK')).toBe('midnight');
  });
});

// ─── letterSpacing 파싱 (DB 값 ÷10) ─────────────────────────────────────────

describe('letterSpacing DB 파싱', () => {
  const parse = (s: string) => parseInt(s, 10) / 10;

  it("'0' → 0.0", () => expect(parse('0')).toBe(0.0));
  it("'15' → 1.5", () => expect(parse('15')).toBe(1.5));
  it("'30' → 3.0", () => expect(parse('30')).toBe(3.0));
});

// ─── keepAwake 파싱 ──────────────────────────────────────────────────────────

describe('keepAwake DB 파싱', () => {
  const parse = (s: string) => s === '1';
  it("'1' → true", () => expect(parse('1')).toBe(true));
  it("'0' → false", () => expect(parse('0')).toBe(false));
});

// ─── MARGIN_MAP ──────────────────────────────────────────────────────────────

describe('MARGIN_MAP', () => {
  it('narrow = 12', () => expect(MARGIN_MAP.narrow).toBe(12));
  it('normal = 24', () => expect(MARGIN_MAP.normal).toBe(24));
  it('wide = 40', () => expect(MARGIN_MAP.wide).toBe(40));
});

// ─── READER_THEMES 완전성 ────────────────────────────────────────────────────

const REQUIRED_FIELDS = ['bg', 'text', 'surface', 'gold', 'muted', 'border', 'headerBg'] as const;
const ALL_THEMES = Object.keys(READER_THEMES) as Array<keyof typeof READER_THEMES>;

describe('READER_THEMES 색상 테이블 완전성', () => {
  it('6종 테마 모두 정의됨', () => {
    expect(ALL_THEMES).toHaveLength(6);
    expect(ALL_THEMES).toContain('midnight');
    expect(ALL_THEMES).toContain('daylight');
    expect(ALL_THEMES).toContain('sepia');
    expect(ALL_THEMES).toContain('forest');
    expect(ALL_THEMES).toContain('rosegold');
    expect(ALL_THEMES).toContain('greystone');
  });

  it.each(ALL_THEMES)('%s 테마: 7개 필드 모두 존재', (theme) => {
    const colors = READER_THEMES[theme];
    for (const field of REQUIRED_FIELDS) {
      expect(colors[field]).toBeTruthy();
    }
  });

  it.each(ALL_THEMES)('%s 테마: 모든 필드가 비어있지 않은 문자열', (theme) => {
    const colors = READER_THEMES[theme];
    for (const field of REQUIRED_FIELDS) {
      expect(typeof colors[field]).toBe('string');
      expect(colors[field].length).toBeGreaterThan(0);
    }
  });

  it('READER_THEME_LABELS: 6종 레이블 모두 정의됨', () => {
    expect(Object.keys(READER_THEME_LABELS)).toHaveLength(6);
    for (const theme of ALL_THEMES) {
      expect(READER_THEME_LABELS[theme]).toBeTruthy();
    }
  });
});

import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSettingsSheet } from '../hooks/useSettingsSheet';
import { READER_THEMES, READER_THEME_LABELS, type ReaderSettings, type ReaderColors, type ReaderTheme, type HorizontalMargin } from '../hooks/useReaderSettings';

const ALL_THEMES = Object.keys(READER_THEMES) as ReaderTheme[];
const ALL_MARGINS: HorizontalMargin[] = ['narrow', 'normal', 'wide'];
const MARGIN_LABELS: Record<HorizontalMargin, string> = { narrow: '좁음', normal: '보통', wide: '넓음' };

const FONT_OPTIONS = [
  { key: 'default' as const,       label: '기본체',   fontStyle: undefined },
  { key: 'serif' as const,         label: '세리프체', fontStyle: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  { key: 'nanumMyeongjo' as const, label: '나눔명조', fontStyle: 'NanumMyeongjo_400Regular' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  colors: ReaderColors;
  onUpdate: (partial: Partial<ReaderSettings>) => void;
  fontsLoaded: boolean;
  meditationPromptEnabled: boolean;
  onToggleMeditationPrompt: (val: boolean) => void;
  isPro: boolean;
  onUpgrade: () => void;
}

export default function ReaderSettingsSheet({
  visible, onClose, settings, colors, onUpdate,
  fontsLoaded, meditationPromptEnabled, onToggleMeditationPrompt,
  isPro, onUpgrade,
}: Props) {
  const { settingsSheetY, settingsBgOpacity, settingsPR, openSettingsSheet, closeSettingsSheet } = useSettingsSheet(onClose);

  const prevVisible = require('react').useRef(false);
  require('react').useEffect(() => {
    if (visible && !prevVisible.current) openSettingsSheet();
    prevVisible.current = visible;
  }, [visible]);

  function handleClose() {
    closeSettingsSheet();
  }

  const fontFamily = (key: string): string | undefined => {
    if (key === 'nanumMyeongjo') return fontsLoaded ? 'NanumMyeongjo_400Regular' : undefined;
    if (key === 'serif') return Platform.OS === 'ios' ? 'Georgia' : 'serif';
    return undefined;
  };

  if (!visible) return null;

  // 서체 섹션 card tint: surface보다 약간 밝은/어두운 배경
  const typoCardBg = `${colors.text}08`;

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View style={[s.backdrop, { opacity: settingsBgOpacity }]} />
      <View style={s.overlayInner}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
        <Animated.View style={[s.sheet, { backgroundColor: colors.surface, borderTopColor: colors.border }, { transform: [{ translateY: settingsSheetY }] }]}>
          <View {...settingsPR.panHandlers} style={s.handleArea}>
            <View style={[s.handle, { backgroundColor: colors.muted }]} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
            <Text style={[s.title, { color: colors.text }]}>읽기 설정</Text>

            {/* ── 섹션 1: 테마 ── */}
            <Text style={[s.sectionLabel, { color: colors.muted }]}>화면 테마</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.themeScroll} contentContainerStyle={s.themeRow}>
              {ALL_THEMES.map(t => {
                const tc = READER_THEMES[t];
                const isSelected = settings.theme === t;
                return (
                  <Pressable
                    key={t}
                    style={[s.themeCard, { backgroundColor: tc.bg, borderColor: isSelected ? tc.gold : tc.border, borderWidth: isSelected ? 2 : 1 }]}
                    onPress={() => onUpdate({ theme: t })}
                  >
                    <Text style={[s.themeCardLabel, { color: tc.text }]}>{READER_THEME_LABELS[t]}</Text>
                    <Text style={[s.themeCardSample, { color: tc.text, opacity: 0.7 }]}>가나다</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ── 섹션 2: 서체 & 타이포그래피 ── */}
            <Text style={[s.sectionLabel, { color: colors.muted }]}>서체 & 타이포그래피</Text>
            <View style={[s.typoCard, { backgroundColor: typoCardBg, borderColor: colors.border }]}>
              {/* 폰트 */}
              <Text style={[s.inlineLabel, { color: colors.muted }]}>폰트</Text>
              <View style={s.fontRow}>
                {FONT_OPTIONS.map(({ key, label, fontStyle }) => {
                  const isSelected = settings.font === key;
                  const isLoading = key === 'nanumMyeongjo' && !fontsLoaded;
                  const style = fontStyle === 'NanumMyeongjo_400Regular'
                    ? (fontsLoaded ? { fontFamily: 'NanumMyeongjo_400Regular' } : {})
                    : fontStyle ? { fontFamily: fontStyle } : {};
                  return (
                    <Pressable
                      key={key}
                      style={[s.fontBtn, { borderColor: isSelected ? colors.gold : colors.border }, isSelected && { backgroundColor: `${colors.gold}20` }]}
                      onPress={() => onUpdate({ font: key })}
                    >
                      <Text style={[s.fontBtnText, { color: isSelected ? colors.gold : isLoading ? colors.muted : colors.text }, style]}>
                        {label}
                      </Text>
                      {isLoading && (
                        <Text style={[s.loadingDot, { color: colors.muted }]}>…</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              {/* 글자 크기 */}
              <View style={s.typoRow}>
                <Text style={[s.typoRowLabel, { color: colors.muted }]}>글자 크기</Text>
                <View style={s.stepperGroup}>
                  <Pressable style={[s.stepBtn, { borderColor: colors.border }]} onPress={() => onUpdate({ fontSize: Math.max(14, settings.fontSize - 1) })} hitSlop={8}>
                    <MaterialCommunityIcons name="minus" size={16} color={colors.text} />
                  </Pressable>
                  <Text style={[s.stepVal, { color: colors.text }]}>{settings.fontSize}</Text>
                  <Pressable style={[s.stepBtn, { borderColor: colors.border }]} onPress={() => onUpdate({ fontSize: Math.min(22, settings.fontSize + 1) })} hitSlop={8}>
                    <MaterialCommunityIcons name="plus" size={16} color={colors.text} />
                  </Pressable>
                </View>
                <Text style={[s.stepPreview, { color: colors.text, fontSize: settings.fontSize, fontFamily: fontFamily(settings.font) }]} numberOfLines={1}>
                  가나다
                </Text>
              </View>

              {/* 줄 간격 */}
              <View style={s.typoRow}>
                <Text style={[s.typoRowLabel, { color: colors.muted }]}>줄 간격</Text>
                <View style={s.stepperGroup}>
                  <Pressable style={[s.stepBtn, { borderColor: colors.border }]} onPress={() => onUpdate({ lineHeight: Math.max(1.4, Math.round((settings.lineHeight - 0.1) * 10) / 10) })} hitSlop={8}>
                    <MaterialCommunityIcons name="minus" size={16} color={colors.text} />
                  </Pressable>
                  <Text style={[s.stepVal, { color: colors.text }]}>{settings.lineHeight.toFixed(1)}</Text>
                  <Pressable style={[s.stepBtn, { borderColor: colors.border }]} onPress={() => onUpdate({ lineHeight: Math.min(2.0, Math.round((settings.lineHeight + 0.1) * 10) / 10) })} hitSlop={8}>
                    <MaterialCommunityIcons name="plus" size={16} color={colors.text} />
                  </Pressable>
                </View>
              </View>

              {/* 글자 간격 */}
              <View style={s.typoRow}>
                <Text style={[s.typoRowLabel, { color: colors.muted }]}>글자 간격</Text>
                <View style={s.stepperGroup}>
                  <Pressable style={[s.stepBtn, { borderColor: colors.border }]} onPress={() => onUpdate({ letterSpacing: Math.max(0, Math.round((settings.letterSpacing - 0.5) * 10) / 10) })} hitSlop={8}>
                    <MaterialCommunityIcons name="minus" size={16} color={colors.text} />
                  </Pressable>
                  <Text style={[s.stepVal, { color: colors.text }]}>{settings.letterSpacing.toFixed(1)}</Text>
                  <Pressable style={[s.stepBtn, { borderColor: colors.border }]} onPress={() => onUpdate({ letterSpacing: Math.min(3.0, Math.round((settings.letterSpacing + 0.5) * 10) / 10) })} hitSlop={8}>
                    <MaterialCommunityIcons name="plus" size={16} color={colors.text} />
                  </Pressable>
                </View>
              </View>

              {/* 여백 */}
              <View style={[s.typoRow, s.typoRowLast]}>
                <Text style={[s.typoRowLabel, { color: colors.muted }]}>여백</Text>
                <View style={s.marginRow}>
                  {ALL_MARGINS.map(m => {
                    const isSelected = settings.horizontalMargin === m;
                    return (
                      <Pressable
                        key={m}
                        style={[s.marginBtn, { borderColor: isSelected ? colors.gold : colors.border }, isSelected && { backgroundColor: `${colors.gold}20` }]}
                        onPress={() => onUpdate({ horizontalMargin: m })}
                      >
                        <Text style={[s.marginBtnText, { color: isSelected ? colors.gold : colors.muted }]}>
                          {MARGIN_LABELS[m]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* ── 섹션 3: 편의 설정 ── */}
            <Text style={[s.sectionLabel, { color: colors.muted }]}>편의 설정</Text>
            <View style={[s.toggleGroup, { borderColor: colors.border }]}>
              <ToggleRow
                label="화면 꺼짐 방지"
                desc="읽는 동안 화면이 꺼지지 않아요"
                value={settings.keepAwake}
                onChange={val => onUpdate({ keepAwake: val })}
                colors={colors}
              />
              <View style={[s.toggleDivider, { backgroundColor: colors.border }]} />
              <ToggleRow
                label="절 번호 숨기기"
                desc="몰입 독서 — 절 번호 없이 읽기"
                value={settings.hideVerseNumbers}
                onChange={val => onUpdate({ hideVerseNumbers: val })}
                colors={colors}
              />
              <View style={[s.toggleDivider, { backgroundColor: colors.border }]} />
              <Pressable
                style={s.toggleRow}
                onPress={!isPro ? onUpgrade : undefined}
                disabled={isPro}
              >
                <View style={s.toggleInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[s.toggleLabel, { color: colors.text }]}>집중 모드</Text>
                    {!isPro && (
                      <View style={[s.proBadge, { backgroundColor: `${colors.gold}18`, borderColor: `${colors.gold}50` }]}>
                        <Text style={[s.proBadgeText, { color: colors.gold }]}>Pro 전용</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.toggleDesc, { color: colors.muted }]}>현재 구절만 강조, 나머지 흐리게</Text>
                </View>
                {isPro ? (
                  <Switch
                    value={settings.focusMode}
                    onValueChange={val => onUpdate({ focusMode: val })}
                    trackColor={{ false: colors.border, true: `${colors.gold}80` }}
                    thumbColor={settings.focusMode ? colors.gold : colors.muted}
                  />
                ) : (
                  <MaterialCommunityIcons name="lock-outline" size={18} color={colors.muted} />
                )}
              </Pressable>
            </View>

            {/* ── 섹션 4: 읽기 완료 ── */}
            <Text style={[s.sectionLabel, { color: colors.muted }]}>읽기 완료</Text>
            <View style={[s.toggleGroup, { borderColor: colors.border }]}>
              <ToggleRow
                label="묵상 입력 프롬프트"
                desc="끄면 완료 즉시 다음 챕터로 이동"
                value={meditationPromptEnabled}
                onChange={onToggleMeditationPrompt}
                colors={colors}
              />
            </View>

          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── 재사용 토글 행 ──────────────────────────────────────────────
interface ToggleRowProps {
  label: string;
  desc: string;
  value: boolean;
  onChange: (val: boolean) => void;
  colors: ReaderColors;
}
function ToggleRow({ label, desc, value, onChange, colors }: ToggleRowProps) {
  return (
    <View style={s.toggleRow}>
      <View style={s.toggleInfo}>
        <Text style={[s.toggleLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[s.toggleDesc, { color: colors.muted }]}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: `${colors.muted}30`, true: colors.gold }}
        thumbColor={value ? '#FFFFFF' : '#888'}
      />
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayInner: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: '85%',
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },

  // ── 섹션 헤더 ──
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 10,
  },

  // ── 테마 카드 ──
  themeScroll: {
    marginHorizontal: -20,
  },
  themeRow: {
    paddingHorizontal: 20,
    gap: 10,
    flexDirection: 'row',
  },
  themeCard: {
    width: 80,
    height: 68,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  themeCardLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  themeCardSample: {
    fontSize: 11,
  },

  // ── 서체 card ──
  typoCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
  },
  inlineLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  fontRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  fontBtn: {
    flex: 1,
    paddingVertical: 9,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  loadingDot: {
    fontSize: 10,
    position: 'absolute',
    bottom: 3,
  },

  // ── 타이포 행 (label + stepper) ──
  typoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  typoRowLast: {
    paddingBottom: 8,
  },
  typoRowLabel: {
    fontSize: 13,
    fontWeight: '500',
    width: 60,
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 7,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepVal: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },
  stepPreview: {
    marginLeft: 12,
    flex: 1,
  },
  marginRow: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  marginBtn: {
    flex: 1,
    paddingVertical: 7,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marginBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── 토글 그룹 ──
  toggleGroup: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toggleDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  toggleDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

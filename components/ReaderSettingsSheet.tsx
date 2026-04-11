import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSettingsSheet } from '../hooks/useSettingsSheet';
import { READER_THEMES, READER_THEME_LABELS, MARGIN_MAP, type ReaderSettings, type ReaderColors, type ReaderTheme, type HorizontalMargin } from '../hooks/useReaderSettings';
import ProGate from './ProGate';

const ALL_THEMES = Object.keys(READER_THEMES) as ReaderTheme[];
const ALL_MARGINS: HorizontalMargin[] = ['narrow', 'normal', 'wide'];
const MARGIN_LABELS: Record<HorizontalMargin, string> = { narrow: '좁음', normal: '보통', wide: '넓음' };

// 폰트 선택지 (이번 스프린트: 나눔명조까지)
const FONT_OPTIONS = [
  { key: 'default' as const,        label: '기본체',   fontStyle: undefined },
  { key: 'serif' as const,          label: '세리프체', fontStyle: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  { key: 'nanumMyeongjo' as const,  label: '나눔명조', fontStyle: 'NanumMyeongjo_400Regular' },
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
  const { settingsSheetY, settingsBgOpacity, settingsPR, openSettingsSheet, closeSettingsSheet } = useSettingsSheet();

  // visible 변경 시 애니메이션 트리거
  const prevVisible = require('react').useRef(false);
  require('react').useEffect(() => {
    if (visible && !prevVisible.current) openSettingsSheet();
    prevVisible.current = visible;
  }, [visible]);

  function handleClose() {
    closeSettingsSheet();
    setTimeout(onClose, 240);
  }

  const fontFamily = (key: string): string | undefined => {
    if (key === 'nanumMyeongjo') return fontsLoaded ? 'NanumMyeongjo_400Regular' : undefined;
    if (key === 'serif') return Platform.OS === 'ios' ? 'Georgia' : 'serif';
    return undefined;
  };

  if (!visible) return null;

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

            {/* ── 테마 ── */}
            <Text style={[s.label, { color: colors.muted }]}>화면 테마</Text>
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

            {/* ── 폰트 ── */}
            <Text style={[s.label, { color: colors.muted }]}>폰트</Text>
            <View style={s.fontRow}>
              {FONT_OPTIONS.map(({ key, label, fontStyle }) => {
                const isSelected = settings.font === key;
                const style = fontStyle === 'NanumMyeongjo_400Regular'
                  ? (fontsLoaded ? { fontFamily: 'NanumMyeongjo_400Regular' } : {})
                  : fontStyle ? { fontFamily: fontStyle } : {};
                return (
                  <Pressable
                    key={key}
                    style={[s.fontBtn, { borderColor: isSelected ? colors.gold : colors.border }, isSelected && { backgroundColor: `${colors.gold}20` }]}
                    onPress={() => onUpdate({ font: key })}
                  >
                    <Text style={[s.fontBtnText, { color: isSelected ? colors.gold : colors.muted }, style]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ── 글자 크기 ── */}
            <Text style={[s.label, { color: colors.muted }]}>글자 크기</Text>
            <View style={s.stepRow}>
              <Pressable style={[s.stepBtn, { borderColor: colors.border }]} onPress={() => onUpdate({ fontSize: Math.max(14, settings.fontSize - 1) })} hitSlop={8}>
                <MaterialCommunityIcons name="minus" size={18} color={colors.text} />
              </Pressable>
              <Text style={[s.stepVal, { color: colors.text }]}>{settings.fontSize}</Text>
              <Pressable style={[s.stepBtn, { borderColor: colors.border }]} onPress={() => onUpdate({ fontSize: Math.min(22, settings.fontSize + 1) })} hitSlop={8}>
                <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
              </Pressable>
              <Text style={[s.stepPreview, { color: colors.text, fontSize: settings.fontSize, fontFamily: fontFamily(settings.font) }]}>
                미리보기 가나다
              </Text>
            </View>

            {/* ── 줄 간격 ── */}
            <Text style={[s.label, { color: colors.muted }]}>줄 간격</Text>
            <View style={s.stepRow}>
              <Pressable style={[s.stepBtn, { borderColor: colors.border }]} onPress={() => onUpdate({ lineHeight: Math.max(1.4, Math.round((settings.lineHeight - 0.1) * 10) / 10) })} hitSlop={8}>
                <MaterialCommunityIcons name="minus" size={18} color={colors.text} />
              </Pressable>
              <Text style={[s.stepVal, { color: colors.text }]}>{settings.lineHeight.toFixed(1)}</Text>
              <Pressable style={[s.stepBtn, { borderColor: colors.border }]} onPress={() => onUpdate({ lineHeight: Math.min(2.0, Math.round((settings.lineHeight + 0.1) * 10) / 10) })} hitSlop={8}>
                <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
              </Pressable>
            </View>

            {/* ── 글자 간격 ── */}
            <Text style={[s.label, { color: colors.muted }]}>글자 간격</Text>
            <View style={s.stepRow}>
              <Pressable style={[s.stepBtn, { borderColor: colors.border }]} onPress={() => onUpdate({ letterSpacing: Math.max(0, Math.round((settings.letterSpacing - 0.5) * 10) / 10) })} hitSlop={8}>
                <MaterialCommunityIcons name="minus" size={18} color={colors.text} />
              </Pressable>
              <Text style={[s.stepVal, { color: colors.text }]}>{settings.letterSpacing.toFixed(1)}</Text>
              <Pressable style={[s.stepBtn, { borderColor: colors.border }]} onPress={() => onUpdate({ letterSpacing: Math.min(3.0, Math.round((settings.letterSpacing + 0.5) * 10) / 10) })} hitSlop={8}>
                <MaterialCommunityIcons name="plus" size={18} color={colors.text} />
              </Pressable>
            </View>

            {/* ── 여백 ── */}
            <Text style={[s.label, { color: colors.muted }]}>여백</Text>
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

            {/* ── 토글 섹션 ── */}
            <View style={[s.divider, { borderTopColor: colors.border }]} />

            <View style={s.toggleRow}>
              <View style={s.toggleInfo}>
                <Text style={[s.toggleLabel, { color: colors.text }]}>화면 꺼짐 방지</Text>
                <Text style={[s.toggleDesc, { color: colors.muted }]}>읽는 동안 화면이 꺼지지 않아요</Text>
              </View>
              <Switch
                value={settings.keepAwake}
                onValueChange={val => onUpdate({ keepAwake: val })}
                trackColor={{ false: colors.border, true: `${colors.gold}80` }}
                thumbColor={settings.keepAwake ? colors.gold : colors.muted}
              />
            </View>

            <View style={s.toggleRow}>
              <View style={s.toggleInfo}>
                <Text style={[s.toggleLabel, { color: colors.text }]}>절 번호 숨기기</Text>
                <Text style={[s.toggleDesc, { color: colors.muted }]}>몰입 독서 — 절 번호 없이 읽기</Text>
              </View>
              <Switch
                value={settings.hideVerseNumbers}
                onValueChange={val => onUpdate({ hideVerseNumbers: val })}
                trackColor={{ false: colors.border, true: `${colors.gold}80` }}
                thumbColor={settings.hideVerseNumbers ? colors.gold : colors.muted}
              />
            </View>

            <View style={s.toggleRow}>
              <View style={s.toggleInfo}>
                <Text style={[s.toggleLabel, { color: colors.text }]}>집중 모드</Text>
                <Text style={[s.toggleDesc, { color: colors.muted }]}>현재 구절만 강조, 나머지 흐리게</Text>
              </View>
              <ProGate isPro={isPro} featureName="집중 모드" onUpgrade={onUpgrade}>
                <Switch
                  value={settings.focusMode}
                  onValueChange={val => onUpdate({ focusMode: val })}
                  trackColor={{ false: colors.border, true: `${colors.gold}80` }}
                  thumbColor={settings.focusMode ? colors.gold : colors.muted}
                />
              </ProGate>
            </View>

            <View style={s.toggleRow}>
              <View style={s.toggleInfo}>
                <Text style={[s.toggleLabel, { color: colors.text }]}>읽기 완료 후 묵상 입력</Text>
                <Text style={[s.toggleDesc, { color: colors.muted }]}>끄면 완료 즉시 다음 챕터로 이동</Text>
              </View>
              <Switch
                value={meditationPromptEnabled}
                onValueChange={onToggleMeditationPrompt}
                trackColor={{ false: colors.border, true: `${colors.gold}80` }}
                thumbColor={meditationPromptEnabled ? colors.gold : colors.muted}
              />
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
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
    paddingBottom: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  // Theme cards
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
    height: 64,
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
    fontSize: 10,
  },
  // Font buttons
  fontRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fontBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  fontBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Stepper
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepVal: {
    fontSize: 16,
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'center',
  },
  stepPreview: {
    marginLeft: 8,
    flex: 1,
  },
  // Margin selector
  marginRow: {
    flexDirection: 'row',
    gap: 8,
  },
  marginBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  marginBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Toggles
  divider: {
    borderTopWidth: 1,
    marginTop: 16,
    marginBottom: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
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
});

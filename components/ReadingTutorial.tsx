import { Animated, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_H } = Dimensions.get('window');

interface StepDef {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  body: string;
  hlYFrac: number;   // spotlight top as fraction of screen height
  hlHFrac: number;   // spotlight height as fraction
  tooltipBelow: boolean;
}

const STEPS: StepDef[] = [
  {
    icon: 'gesture-tap',
    title: '절을 탭하세요',
    body: '절을 탭하면 읽은 절로 표시됩니다.\n완독한 절은 반투명하게 변해요.',
    hlYFrac: 0.28,
    hlHFrac: 0.09,
    tooltipBelow: true,
  },
  {
    icon: 'check-circle-outline',
    title: '읽기 완료',
    body: '"읽기 완료" 버튼을 탭하면 챕터를 완료해요.\n묵상을 기록하거나 다음 챕터로 이동합니다.',
    hlYFrac: 0.76,
    hlHFrac: 0.10,
    tooltipBelow: false,
  },
  {
    icon: 'swap-horizontal',
    title: '이전 / 다음 챕터',
    body: '화면 하단 좌우 버튼으로\n이전/다음 챕터를 이동해요.',
    hlYFrac: 0.88,
    hlHFrac: 0.09,
    tooltipBelow: false,
  },
  {
    icon: 'gesture-tap-hold',
    title: '길게 누르기',
    body: '절을 길게 누르면 범위를 선택할 수 있어요.\n선택 후 묵상을 남기거나 복사할 수 있습니다.',
    hlYFrac: 0.33,
    hlHFrac: 0.09,
    tooltipBelow: true,
  },
];

const PAD = 10;
const TOOLTIP_H = 172;
const DARK = 'rgba(0,0,0,0.80)';

interface Props {
  step: number;
  overlayOpacity: Animated.Value;
  onNext: () => void;
  onDismiss: () => void;
}

export function ReadingTutorial({ step, overlayOpacity, onNext, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const s = STEPS[step];

  const spotY = s.hlYFrac * SCREEN_H;
  const spotH = s.hlHFrac * SCREEN_H;

  // Tooltip vertical position
  let tooltipTop: number;
  if (s.tooltipBelow) {
    tooltipTop = spotY + spotH + PAD + 14;
    if (tooltipTop + TOOLTIP_H > SCREEN_H - 24) tooltipTop = SCREEN_H - TOOLTIP_H - 24;
  } else {
    tooltipTop = spotY - PAD - 14 - TOOLTIP_H;
    if (tooltipTop < insets.top + 44) tooltipTop = insets.top + 44;
  }

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: overlayOpacity, zIndex: 300 }]}>
      {/* Top dark region */}
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.max(0, spotY - PAD), backgroundColor: DARK }}
        onPress={onNext}
      />
      {/* Bottom dark region */}
      <Pressable
        style={{ position: 'absolute', top: spotY + spotH + PAD, left: 0, right: 0, bottom: 0, backgroundColor: DARK }}
        onPress={onNext}
      />
      {/* Spotlight area — transparent but touch-consuming */}
      <Pressable
        style={{ position: 'absolute', top: spotY - PAD, left: 0, right: 0, height: spotH + PAD * 2 }}
        onPress={onNext}
      />
      {/* Spotlight border glow */}
      <View pointerEvents="none" style={{
        position: 'absolute',
        top: spotY - PAD,
        left: 4,
        right: 4,
        height: spotH + PAD * 2,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#D4A847',
      }} />

      {/* Tooltip card */}
      <Pressable
        onPress={onNext}
        style={{
          position: 'absolute',
          top: tooltipTop,
          left: 16,
          right: 16,
          backgroundColor: 'rgba(13,12,20,0.97)',
          borderRadius: 20,
          padding: 18,
          borderWidth: 1,
          borderColor: 'rgba(212,168,71,0.30)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.5,
          shadowRadius: 16,
          elevation: 16,
        }}
      >
        {/* Arrow chevron pointing toward spotlight */}
        {s.tooltipBelow && (
          <MaterialCommunityIcons name="chevron-up" size={20} color="#D4A847" style={styles.chevron} />
        )}

        <View style={styles.titleRow}>
          <MaterialCommunityIcons name={s.icon} size={22} color="#D4A847" />
          <Text style={styles.title}>{s.title}</Text>
        </View>
        <Text style={styles.body}>{s.body}</Text>

        <View style={styles.footer}>
          {/* Step indicator dots */}
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { width: i === step ? 16 : 6, backgroundColor: i === step ? '#D4A847' : 'rgba(212,168,71,0.28)' },
                ]}
              />
            ))}
          </View>
          {/* Next button */}
          <Pressable style={styles.nextBtn} onPress={onNext}>
            <Text style={styles.nextBtnText}>
              {step === STEPS.length - 1 ? '시작!' : '다음 →'}
            </Text>
          </Pressable>
        </View>

        {!s.tooltipBelow && (
          <MaterialCommunityIcons name="chevron-down" size={20} color="#D4A847" style={[styles.chevron, { marginTop: 10, marginBottom: 0 }]} />
        )}
      </Pressable>

      {/* Skip button */}
      <Pressable
        style={[styles.skipBtn, { top: insets.top + 8 }]}
        onPress={onDismiss}
        hitSlop={12}
      >
        <Text style={styles.skipText}>건너뛰기</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chevron: { alignSelf: 'center', marginBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  title: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  body: { fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.68)', marginBottom: 16 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { height: 6, borderRadius: 3 },
  nextBtn: { backgroundColor: '#D4A847', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  nextBtnText: { fontSize: 13, fontWeight: '700', color: '#0B0A12' },
  skipBtn: { position: 'absolute', right: 16, paddingVertical: 6, paddingHorizontal: 10 },
  skipText: { color: 'rgba(255,255,255,0.38)', fontSize: 12 },
});

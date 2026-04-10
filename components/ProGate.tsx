import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

interface Props {
  isPro: boolean;
  featureName: string;       // e.g. "AI 구절 해설"
  onUpgrade: () => void;
  children: React.ReactNode;
}

/**
 * ProGate — Pro 전용 기능 래퍼
 * isPro=true  → children 그대로 렌더
 * isPro=false → 잠금 플레이스홀더 + 업그레이드 CTA
 */
export default function ProGate({ isPro, featureName, onUpgrade, children }: Props) {
  if (isPro) return <>{children}</>;

  return (
    <View style={styles.container}>
      <View style={styles.lockIcon}>
        <MaterialCommunityIcons name="lock" size={22} color={theme.gold} />
      </View>
      <Text style={styles.title}>Pro 전용 기능</Text>
      <Text style={styles.desc}>{featureName}은{'\n'}Manna Pro 구독자만 이용할 수 있습니다.</Text>
      <Pressable
        style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        onPress={onUpgrade}
      >
        <MaterialCommunityIcons name="crown" size={14} color={theme.bg} style={{ marginRight: 6 }} />
        <Text style={styles.ctaText}>Pro 시작하기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  lockIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.goldBg,
    borderWidth: 1,
    borderColor: theme.goldBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 16, fontWeight: '700', color: theme.text },
  desc: { fontSize: 13, color: theme.textSub, textAlign: 'center', lineHeight: 20 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.gold,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 8,
  },
  ctaText: { fontSize: 14, fontWeight: '700', color: theme.bg },
});

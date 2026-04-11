import { Modal, Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

interface Feature {
  icon: string;
  title: string;
  desc: string;
}

const PRO_FEATURES: Feature[] = [
  { icon: 'headphones',         title: 'TTS 낭독',       desc: '말씀을 음성으로 듣기' },
  { icon: 'brain',              title: 'AI 묵상 질문',   desc: '구절에서 나온 깊은 질문 3가지' },
  { icon: 'book-open-page-variant', title: 'AI 구절 해설', desc: '역사적 배경과 원어 의미' },
  { icon: 'hands-pray',         title: 'AI 기도문',      desc: '말씀에서 나온 나만의 기도' },
  { icon: 'compass-rose',       title: 'AI 맞춤 구절 추천', desc: 'AI가 내 상황에 맞는 말씀 추천' },
  { icon: 'calendar-month',     title: 'Streak 히트맵',  desc: '연간 읽기 기록 한눈에' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onPurchase: () => Promise<void>;
  loading?: boolean;
  price?: string;
}

export default function PaywallSheet({ visible, onClose, onPurchase, loading = false, price = '₩3,300/월' }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.crownBadge}>
              <MaterialCommunityIcons name="crown" size={24} color={theme.gold} />
            </View>
            <Text style={styles.title}>Manna Pro</Text>
            <Text style={styles.subtitle}>AI가 함께하는 성경 읽기</Text>
          </View>

          {/* Feature list */}
          <View style={styles.features}>
            {PRO_FEATURES.map((f) => (
              <View key={f.title} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <MaterialCommunityIcons name={f.icon as any} size={18} color={theme.gold} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }, loading && { opacity: 0.6 }]}
            onPress={onPurchase}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={theme.bg} />
              : <Text style={styles.ctaText}>{price} 구독 시작</Text>
            }
          </Pressable>

          <Text style={styles.fine}>언제든 취소 가능 · Apple 구독 관리에서 해지</Text>

          <Pressable onPress={onClose} hitSlop={12} style={styles.skip}>
            <Text style={styles.skipText}>나중에</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.textMuted,
    alignSelf: 'center',
    marginBottom: 20,
  },

  header: { alignItems: 'center', marginBottom: 24 },
  crownBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.goldBg,
    borderWidth: 1,
    borderColor: theme.goldBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: 0.3 },
  subtitle: { fontSize: 14, color: theme.textSub, marginTop: 4 },

  features: {
    gap: 12,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.goldBg,
    borderWidth: 1,
    borderColor: theme.goldBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  featureDesc: { fontSize: 12, color: theme.textSub, marginTop: 1 },

  cta: {
    backgroundColor: theme.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  ctaText: { fontSize: 16, fontWeight: '800', color: theme.bg },

  fine: { fontSize: 11, color: theme.textMuted, textAlign: 'center', marginBottom: 8 },

  skip: { alignItems: 'center', paddingVertical: 4 },
  skipText: { fontSize: 14, color: theme.textMuted },
});

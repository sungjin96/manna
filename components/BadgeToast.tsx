import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BadgeToastItem } from '../hooks/useBadgeToast';

const TIER_COLORS = {
  bronze:  '#CD7F32',
  silver:  '#A8B0BB',
  gold:    '#D4A847',
  diamond: '#7EC8E3',
};

const TIER_LABELS = {
  bronze: 'BRONZE',
  silver: 'SILVER',
  gold: 'GOLD',
  diamond: 'DIAMOND',
};

interface Props {
  item: BadgeToastItem;
  toastY: Animated.Value;
  onDismiss: () => void;
}

export function BadgeToast({ item, toastY, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const color = TIER_COLORS[item.tier];

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          top: insets.top + 8,
          borderColor: color + '50',
          transform: [{ translateY: toastY }],
        },
      ]}
    >
      <Pressable style={styles.inner} onPress={onDismiss}>
        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: color + '20', borderColor: color + '40' }]}>
          <MaterialCommunityIcons name={item.icon} size={20} color={color} />
        </View>

        {/* Text */}
        <View style={styles.textCol}>
          <Text style={styles.label}>🏅 새 배지 획득!</Text>
          <Text style={[styles.badgeName, { color }]}>{item.title}</Text>
          <Text style={[styles.tier, { color: color + 'AA' }]}>{TIER_LABELS[item.tier]}</Text>
        </View>

        {/* Close */}
        <MaterialCommunityIcons name="close" size={14} color="rgba(255,255,255,0.35)" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 500,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(15,14,22,0.96)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1 },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 1 },
  badgeName: { fontSize: 15, fontWeight: '700' },
  tier: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 1 },
});

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import type { BadgeIconName, Tier } from '../app/(tabs)/achievements';

const TIER_COLORS: Record<Tier, string> = {
  bronze: '#CD7F32',
  silver: '#A8B0BB',
  gold: '#D4A847',
  diamond: '#7EC8E3',
};

interface Props {
  /** 0–100 진행률 */
  percentage: number;
  /** 링 크기 (외경) */
  size?: number;
  /** 스트로크 두께 */
  strokeWidth?: number;
  /** 중앙에 표시할 뱃지 (없으면 % 숫자 표시) */
  badge?: { icon: BadgeIconName; tier: Tier; title: string } | null;
  /** 탭 시 콜백 */
  onPress?: () => void;
}

/**
 * 원형 진행률 링 — View 기반 반원 클리핑 기법.
 *
 * 원리: 두 개의 반원(left half, right half)을 각각 회전시켜
 * 0–180° / 180–360° 범위의 아크를 표현한다.
 */
export default function ProgressRing({
  percentage,
  size = 120,
  strokeWidth = 6,
  badge,
  onPress,
}: Props) {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: percentage,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [percentage]);

  const half = size / 2;
  const innerSize = size - strokeWidth * 2;
  const badgeIconSize = Math.round(size * 0.3);

  // 0–50% → right half만 회전, left half 숨김
  // 50–100% → right half 180°, left half 나머지 회전
  const rightRotate = animValue.interpolate({
    inputRange: [0, 50, 100],
    outputRange: ['0deg', '180deg', '180deg'],
    extrapolate: 'clamp',
  });

  const leftRotate = animValue.interpolate({
    inputRange: [0, 50, 100],
    outputRange: ['0deg', '0deg', '180deg'],
    extrapolate: 'clamp',
  });

  const leftOpacity = animValue.interpolate({
    inputRange: [0, 49.9, 50, 100],
    outputRange: [0, 0, 1, 1],
    extrapolate: 'clamp',
  });

  const content = (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessibilityLabel={`성경 읽기 진행률 ${Math.round(percentage)}퍼센트`}
      accessibilityRole="progressbar"
      // @ts-ignore - RN accessibilityValue typing
      accessibilityValue={{ now: percentage, min: 0, max: 100 }}
    >
      {/* Track (background circle) */}
      <View
        style={[
          styles.track,
          {
            width: size,
            height: size,
            borderRadius: half,
            borderWidth: strokeWidth,
          },
        ]}
      />

      {/* Right half clip */}
      <View style={[styles.halfClip, { width: half, height: size, left: half }]}>
        <Animated.View
          style={[
            styles.halfCircle,
            {
              width: size,
              height: size,
              borderRadius: half,
              borderWidth: strokeWidth,
              left: -half,
              transform: [{ rotate: rightRotate }],
            },
          ]}
        />
      </View>

      {/* Left half clip */}
      <Animated.View
        style={[
          styles.halfClip,
          { width: half, height: size, left: 0, opacity: leftOpacity },
        ]}
      >
        <Animated.View
          style={[
            styles.halfCircle,
            {
              width: size,
              height: size,
              borderRadius: half,
              borderWidth: strokeWidth,
              left: 0,
              transform: [{ rotate: leftRotate }],
            },
          ]}
        />
      </Animated.View>

      {/* Center content */}
      <View style={[styles.center, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
        {badge ? (
          <View style={styles.badgeCenter}>
            <MaterialCommunityIcons
              name={badge.icon}
              size={badgeIconSize}
              color={TIER_COLORS[badge.tier]}
            />
            <Text
              style={[styles.badgeTitle, { color: TIER_COLORS[badge.tier] }]}
              numberOfLines={1}
            >
              {badge.title}
            </Text>
          </View>
        ) : (
          <Text style={styles.percentText}>{Math.round(percentage)}%</Text>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityLabel={badge ? `대표 뱃지: ${badge.title}. 탭하여 변경` : '뱃지 선택'}
        accessibilityRole="button"
        accessibilityHint="뱃지 선택 화면을 엽니다"
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    borderColor: theme.goldBg,
  },
  halfClip: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  halfCircle: {
    position: 'absolute',
    top: 0,
    borderColor: theme.gold,
    // Only show the border on the relevant half
    // This is achieved by the clipping container
  },
  center: {
    position: 'absolute',
    backgroundColor: theme.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCenter: {
    alignItems: 'center',
    gap: 2,
  },
  badgeTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  percentText: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.gold,
    letterSpacing: -1,
  },
});

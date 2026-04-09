import { useRef, useState } from 'react';
import { Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

const PARTICLE_COLORS = ['#D4A847', '#F0C96A', '#FF7B7B', '#7BFFC8', '#7BB8FF', '#D47BFF', '#FFB87B'];
const PARTICLE_COUNT = 22;

function createParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
    const spread = (Math.random() - 0.5) * 0.6;
    return {
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
      angle: angle + spread,
      distance: 90 + Math.random() * 100,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      size: 6 + Math.random() * 6,
    };
  });
}

export type Particle = ReturnType<typeof createParticles>[number];

export function useConfetti() {
  const [showConfetti, setShowConfetti] = useState(false);
  const particles = useRef<Particle[]>(createParticles());

  function fireConfetti() {
    const pts = particles.current;
    setShowConfetti(true);
    pts.forEach(p => { p.x.setValue(0); p.y.setValue(0); p.opacity.setValue(1); p.scale.setValue(0); });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const animations = pts.map(p =>
      Animated.parallel([
        Animated.timing(p.x, { toValue: Math.cos(p.angle) * p.distance, duration: 700, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: Math.sin(p.angle) * p.distance - 40, duration: 700, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(p.scale, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(p.opacity, { toValue: 0, duration: 580, useNativeDriver: true }),
        ]),
      ])
    );
    Animated.parallel(animations).start(() => setShowConfetti(false));
  }

  return { showConfetti, particles: particles.current, fireConfetti };
}

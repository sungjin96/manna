import { useRef, useEffect } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

export interface MannaAlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: MannaAlertButton[];
  onDismiss?: () => void;
}

export default function MannaAlert({ visible, title, message, buttons, onDismiss }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 8, tension: 100, useNativeDriver: true }),
      ]).start();
    } else {
      opacity.setValue(0);
      scale.setValue(0.9);
    }
  }, [visible]);

  const resolvedButtons = buttons ?? [{ text: '확인', style: 'default' }];

  function handlePress(btn: MannaAlertButton) {
    btn.onPress?.();
    onDismiss?.();
  }

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none">
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onDismiss} />
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.btnRow}>
            {resolvedButtons.map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              return (
                <Pressable
                  key={i}
                  style={[
                    styles.btn,
                    isDestructive && styles.btnDestructive,
                    !isDestructive && !isCancel && styles.btnDefault,
                    isCancel && styles.btnCancel,
                  ]}
                  onPress={() => handlePress(btn)}
                >
                  <Text style={[
                    styles.btnText,
                    isDestructive && styles.btnTextDestructive,
                    !isDestructive && !isCancel && styles.btnTextDefault,
                    isCancel && styles.btnTextCancel,
                  ]}>
                    {btn.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  card: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: theme.border,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.textSub,
    textAlign: 'center',
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDefault: {
    backgroundColor: theme.gold,
  },
  btnCancel: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: theme.border,
  },
  btnDestructive: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  btnTextDefault: {
    color: theme.bg,
  },
  btnTextCancel: {
    color: theme.textSub,
  },
  btnTextDestructive: {
    color: '#EF4444',
  },
});

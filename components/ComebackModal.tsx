import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

interface Props {
  visible: boolean;
  previousStreak: number;
  onQuickRead: () => void;
  onDismiss: () => void;
}

export default function ComebackModal({ visible, previousStreak, onQuickRead, onDismiss }: Props) {
  const streakLine = previousStreak > 0
    ? `${previousStreak}일 동안의 묵상은 사라지지 않았어요.`
    : '그동안의 묵상은 사라지지 않았어요.';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <MaterialCommunityIcons name="heart-outline" size={40} color={theme.gold} />
          <Text style={styles.title}>{streakLine}</Text>
          <Text style={styles.body}>오늘 1구절부터 다시 시작해볼래요?</Text>
          <Pressable style={styles.btn} onPress={onQuickRead}>
            <Text style={styles.btnText}>1구절 읽기</Text>
          </Pressable>
          <Pressable style={styles.skip} onPress={onDismiss}>
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 380,
  },
  title: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  body: {
    color: theme.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  btn: {
    marginTop: 8,
    backgroundColor: theme.gold,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
  },
  btnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  skip: {
    paddingVertical: 8,
  },
  skipText: {
    color: theme.textMuted,
    fontSize: 14,
  },
});

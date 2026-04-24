import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getDailyEntry } from '../utils/daily-meditation';
import { markQuickRead } from '../db/readings';
import { setSetting } from '../db/settings';
import { theme } from '../constants/theme';

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function QuickReadScreen() {
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);

  const entry = getDailyEntry();

  async function handleAmen() {
    if (done || !entry) return;
    setDone(true);
    const today = todayLocal();
    try {
      await markQuickRead(entry.bookId, entry.chapter, entry.verse, today);
      await setSetting('daily_verse_read_date', today);
    } catch {
      setDone(false);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)');
  }

  function handleFullRead() {
    if (!entry) return;
    router.replace(`/read/${entry.bookId}/${entry.chapter}?verse=${entry.verse}&openMeditation=1`);
  }

  if (!entry) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>오늘의 말씀을 불러올 수 없습니다</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* 상단 바 */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={16}
          style={styles.closeBtn}
          accessibilityLabel="닫기"
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
        </Pressable>

        <Pressable
          onPress={handleFullRead}
          hitSlop={12}
          style={styles.fullReadBtn}
          accessibilityLabel="챕터 전체 읽기"
          accessibilityRole="button"
        >
          <Text style={styles.fullReadText}>전체 읽기</Text>
          <MaterialCommunityIcons name="chevron-right" size={14} color={theme.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.ref}>{entry.ref}</Text>
        <Text style={styles.verse}>{entry.text}</Text>

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>묵상 포인트</Text>
        <Text style={styles.question}>{entry.question}</Text>

        <TextInput
          style={styles.input}
          placeholder="한 줄 묵상 (선택)"
          placeholderTextColor={theme.textMuted}
          value={note}
          onChangeText={setNote}
          maxLength={200}
          multiline
          returnKeyType="done"
        />

        <Pressable
          style={[styles.amenBtn, done && styles.amenBtnDone]}
          onPress={handleAmen}
          disabled={done}
        >
          <Text style={styles.amenText}>{done ? '완료' : '아멘'}</Text>
        </Pressable>

        <Text style={styles.swipeHint}>아래로 쓸어내려 닫기</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 8,
  },
  closeBtn: {
    padding: 4,
  },
  fullReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 4,
  },
  fullReadText: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  scroll: {
    padding: 28,
    paddingTop: 16,
    paddingBottom: 60,
  },
  ref: {
    color: theme.gold,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  verse: {
    color: theme.text,
    fontSize: 20,
    lineHeight: 32,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: 24,
  },
  sectionLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  question: {
    color: theme.textSub,
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 24,
  },
  input: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.text,
    fontSize: 15,
    lineHeight: 22,
    padding: 16,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: 32,
  },
  amenBtn: {
    backgroundColor: theme.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  amenBtnDone: {
    opacity: 0.5,
  },
  amenText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  swipeHint: {
    color: theme.textMuted,
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.5,
    letterSpacing: 0.3,
  },
  center: {
    flex: 1,
    backgroundColor: theme.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: theme.textMuted,
    fontSize: 15,
  },
});

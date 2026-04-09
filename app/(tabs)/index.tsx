import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useStreak } from '../../hooks/useStreak';
import { getLastReadPosition } from '../../db/readings';
import { getSetting, setSetting } from '../../db/settings';
import { BOOKS, TOTAL_CHAPTERS } from '../../constants/books';
import { theme } from '../../constants/theme';

const XP_PER_LEVEL = 1200;

function nextAfter(bookId: number, chapter: number): { bookId: number; chapter: number } {
  const book = BOOKS.find(b => b.id === bookId);
  if (!book) return { bookId: 1, chapter: 1 };
  if (chapter < book.chapters) return { bookId, chapter: chapter + 1 };
  const nextBook = BOOKS.find(b => b.id === bookId + 1);
  return nextBook ? { bookId: nextBook.id, chapter: 1 } : { bookId: 1, chapter: 1 };
}

const ONBOARDING_PAGES = [
  {
    icon: 'fire' as const,
    title: '매일, 한 챕터',
    body: '하루 5분. 성경 한 챕터를 읽고\n연속 읽기 기록을 쌓아보세요.',
  },
  {
    icon: 'notebook-edit-outline' as const,
    title: '묵상을 기록하세요',
    body: '오늘 읽은 말씀에서\n마음에 닿은 한 줄을 남겨보세요.',
  },
  {
    icon: 'trophy-outline' as const,
    title: 'XP와 레벨업',
    body: '챕터를 읽을수록 XP를 얻고\n레벨이 올라갑니다. 성경 완독까지!',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { stats, loading, refresh } = useStreak();
  const [nextChapter, setNextChapter] = useState<{ bookId: number; chapter: number }>({ bookId: 1, chapter: 1 });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingPage, setOnboardingPage] = useState(0);

  useFocusEffect(
    useCallback(() => {
      refresh();
      getLastReadPosition().then(pos => {
        setNextChapter(pos ? nextAfter(pos.bookId, pos.chapter) : { bookId: 1, chapter: 1 });
      });
    }, [refresh])
  );

  useEffect(() => {
    getSetting('onboarding_complete', '0').then(val => {
      if (val === '0') setShowOnboarding(true);
    });
  }, []);

  async function completeOnboarding() {
    await setSetting('onboarding_complete', '1');
    setShowOnboarding(false);
  }

  function nextPage() {
    if (onboardingPage < ONBOARDING_PAGES.length - 1) {
      setOnboardingPage(p => p + 1);
    } else {
      completeOnboarding();
    }
  }

  const { bookId, chapter } = nextChapter;
  const book = BOOKS.find(b => b.id === bookId);

  const xp = stats.totalChapters * 45;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpInLevel = xp % XP_PER_LEVEL;
  const xpPct = Math.round((xpInLevel / XP_PER_LEVEL) * 100);
  const levelTitles = ['', '구도자', '순례자', '제자', '선지자', '사도', '장로'];
  const levelTitle = levelTitles[Math.min(level, levelTitles.length - 1)];

  const page = ONBOARDING_PAGES[onboardingPage];

  return (
    <View style={styles.container}>
      {/* Streak hero */}
      <View style={styles.streakSection}>
        <MaterialCommunityIcons name="fire" size={48} color={theme.gold} />
        <Text style={styles.streakCount}>{stats.currentStreak}</Text>
        <Text style={styles.streakLabel}>일 연속 읽기</Text>
        {stats.longestStreak > 0 && (
          <Text style={styles.longestStreak}>최장 기록 {stats.longestStreak}일</Text>
        )}
      </View>

      {/* XP bar */}
      <View style={styles.xpSection}>
        <View style={styles.xpMeta}>
          <Text style={styles.xpLevel}>Lv.{level} {levelTitle}</Text>
          <Text style={styles.xpValue}>{xpInLevel} / {XP_PER_LEVEL} XP</Text>
        </View>
        <View style={styles.xpBar}>
          <View style={[styles.xpFill, { width: `${xpPct}%` as any }]} />
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{stats.totalChapters}</Text>
          <Text style={styles.statLabel}>읽은 챕터</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>
            {Math.round((stats.totalChapters / 1189) * 100)}%
          </Text>
          <Text style={styles.statLabel}>전체 진행률</Text>
        </View>
      </View>

      {/* CTA */}
      <Pressable
        style={({ pressed }) => [styles.readBtn, pressed && styles.readBtnPressed]}
        onPress={() => router.push(`/read/${bookId}/${chapter}`)}
      >
        <Text style={styles.readBtnTitle}>오늘 읽기</Text>
        <Text style={styles.readBtnSub}>
          {book?.name} {chapter}장
        </Text>
      </Pressable>

      {/* Onboarding modal */}
      <Modal visible={showOnboarding} transparent animationType="fade">
        <View style={styles.onboardingOverlay}>
          <View style={styles.onboardingCard}>
            <MaterialCommunityIcons name={page.icon} size={72} color={theme.gold} />
            <Text style={styles.onboardingTitle}>{page.title}</Text>
            <Text style={styles.onboardingBody}>{page.body}</Text>

            {/* Page dots */}
            <View style={styles.dots}>
              {ONBOARDING_PAGES.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === onboardingPage && styles.dotActive]}
                />
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [styles.onboardingBtn, pressed && styles.onboardingBtnPressed]}
              onPress={nextPage}
            >
              <Text style={styles.onboardingBtnText}>
                {onboardingPage < ONBOARDING_PAGES.length - 1 ? '다음' : '시작하기'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    padding: 24,
    paddingTop: 64,
  },
  streakSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  streakCount: {
    fontSize: 88,
    fontWeight: '900',
    color: theme.gold,
    lineHeight: 96,
    letterSpacing: -4,
  },
  streakLabel: {
    fontSize: 16,
    color: theme.textSub,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  longestStreak: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 6,
  },

  xpSection: {
    marginBottom: 24,
    gap: 8,
  },
  xpMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xpLevel: {
    fontSize: 12,
    color: theme.gold,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  xpValue: {
    fontSize: 11,
    color: theme.textMuted,
  },
  xpBar: {
    height: 6,
    backgroundColor: theme.goldBg,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.goldBorder,
  },
  xpFill: {
    height: '100%',
    backgroundColor: theme.gold,
    borderRadius: 3,
    shadowColor: theme.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  statBox: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.goldBorder,
  },
  statNum: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.gold,
  },
  statLabel: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 4,
    letterSpacing: 0.3,
  },

  readBtn: {
    backgroundColor: theme.gold,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  readBtnPressed: {
    backgroundColor: theme.goldDark,
  },
  readBtnTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.bg,
    letterSpacing: 0.3,
  },
  readBtnSub: {
    fontSize: 13,
    color: 'rgba(11,10,18,0.65)',
    marginTop: 4,
  },

  // Onboarding
  onboardingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  onboardingCard: {
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: theme.goldBorder,
    gap: 16,
  },
  onboardingTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.text,
    textAlign: 'center',
  },
  onboardingBody: {
    fontSize: 15,
    color: theme.textSub,
    textAlign: 'center',
    lineHeight: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.borderSubtle,
  },
  dotActive: {
    backgroundColor: theme.gold,
    width: 20,
  },
  onboardingBtn: {
    backgroundColor: theme.gold,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
  },
  onboardingBtnPressed: { backgroundColor: theme.goldDark },
  onboardingBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.bg,
    letterSpacing: 0.3,
  },
});

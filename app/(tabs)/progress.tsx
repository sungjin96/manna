import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BOOKS } from '../../constants/books';
import { useReadingProgress } from '../../hooks/useReadingProgress';
import { checkAIEntitlement, purchasePremium } from '../../utils/subscriptions';
import { getStats, type UserStats } from '../../db/stats';
import { getMeditationCount } from '../../db/meditations';
import { BADGES, BOOK_BADGES, type Badge, type Tier } from './achievements';
import StreakHeatmap from '../../components/StreakHeatmap';
import PaywallSheet from '../../components/PaywallSheet';
import { theme } from '../../constants/theme';

const TIER_COLORS: Record<Tier, string> = {
  bronze: '#CD7F32', silver: '#A8B0BB', gold: '#D4A847', diamond: '#7EC8E3',
};

type AccordionItem =
  | { type: 'section'; label: string }
  | { type: 'header'; bookId: number }
  | { type: 'chapter'; bookId: number; chapter: number };

export default function ProgressScreen() {
  const router = useRouter();
  const { completed, loading } = useReadingProgress();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [isPro, setIsPro] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallLoading, setPaywallLoading] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [meditationCount, setMeditationCount] = useState(0);

  useEffect(() => {
    checkAIEntitlement().then(setIsPro).catch(() => {});
    getStats().then(setStats);
    getMeditationCount().then(setMeditationCount);
  }, []);

  async function handlePurchase() {
    setPaywallLoading(true);
    const result = await purchasePremium();
    setPaywallLoading(false);
    if (result.success) {
      setShowPaywall(false);
      setIsPro(true);
    }
  }

  const toggleBook = useCallback((bookId: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }, []);

  const items = useMemo<AccordionItem[]>(() => {
    const out: AccordionItem[] = [];
    // 구약/신약 섹션 헤더 삽입
    out.push({ type: 'section', label: '구약 (39권)' });
    for (const book of BOOKS) {
      if (book.id === 40) out.push({ type: 'section', label: '신약 (27권)' });
      out.push({ type: 'header', bookId: book.id });
      if (expanded.has(book.id)) {
        for (let ch = 1; ch <= book.chapters; ch++) {
          out.push({ type: 'chapter', bookId: book.id, chapter: ch });
        }
      }
    }
    return out;
  }, [expanded]);

  const renderItem = useCallback(
    ({ item }: { item: AccordionItem }) => {
      if (item.type === 'section') {
        return (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>{item.label}</Text>
          </View>
        );
      }

      if (item.type === 'header') {
        const book = BOOKS[item.bookId - 1];
        const doneCount = Array.from({ length: book.chapters }, (_, i) =>
          completed.has(`${book.id}:${i + 1}`) ? 1 : 0
        ).reduce((a: number, b: number) => a + b, 0);
        const isOpen = expanded.has(book.id);
        const pct = (doneCount / book.chapters) * 100;

        return (
          <Pressable style={styles.bookRow} onPress={() => toggleBook(book.id)}>
            <View style={styles.bookInfo}>
              <Text style={styles.bookName}>{book.name}</Text>
              <Text style={styles.bookProgress}>
                {doneCount}/{book.chapters}
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
            </View>
            <MaterialCommunityIcons
              name={isOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={theme.textMuted}
            />
          </Pressable>
        );
      }

      const key = `${item.bookId}:${item.chapter}`;
      const done = completed.has(key);
      return (
        <Pressable
          style={styles.chapterRow}
          onPress={() => router.push(`/read/${item.bookId}/${item.chapter}`)}
        >
          <Text style={[styles.chapterNum, done && styles.chapterDone]}>
            {item.chapter}장
          </Text>
          {done && (
            <MaterialCommunityIcons name="check-circle" size={16} color={theme.gold} />
          )}
        </Pressable>
      );
    },
    [completed, expanded, toggleBook, router]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>불러오는 중...</Text>
      </View>
    );
  }

  const totalDone = completed.size;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>진행률</Text>
        <Text style={styles.headerSub}>{totalDone} / 1189 챕터</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={item =>
          item.type === 'section'
            ? `s-${item.label}`
            : item.type === 'header'
            ? `h-${item.bookId}`
            : `c-${item.bookId}-${item.chapter}`
        }
        renderItem={renderItem}
        removeClippedSubviews
        maxToRenderPerBatch={20}
        windowSize={10}
        ListHeaderComponent={
          <Pressable
            style={styles.heatmapWrapper}
            onPress={() => isPro ? router.push('/reading-history') : setShowPaywall(true)}
          >
            <StreakHeatmap isPro={isPro} onUpgrade={() => setShowPaywall(true)} />
          </Pressable>
        }
        ListFooterComponent={stats ? (
          <View style={styles.badgeSection}>
            <View style={styles.badgeSectionHeader}>
              <Text style={styles.badgeSectionTitle}>뱃지</Text>
              <Pressable onPress={() => router.push('/(tabs)/achievements')} hitSlop={8}>
                <Text style={styles.badgeSeeAll}>전체 보기</Text>
              </Pressable>
            </View>
            <View style={styles.badgeGrid}>
              {[...BADGES, ...BOOK_BADGES]
                .filter(b => b.check(stats, completed, meditationCount))
                .slice(0, 8)
                .map(b => (
                  <View key={b.id} style={styles.badgeItem}>
                    <View style={[styles.badgeIcon, { backgroundColor: `${TIER_COLORS[b.tier]}15` }]}>
                      <MaterialCommunityIcons name={b.icon} size={20} color={TIER_COLORS[b.tier]} />
                    </View>
                    <Text style={styles.badgeName} numberOfLines={1}>{b.title}</Text>
                  </View>
                ))}
            </View>
            {[...BADGES, ...BOOK_BADGES].filter(b => b.check(stats, completed, meditationCount)).length === 0 && (
              <Text style={styles.badgeEmpty}>아직 획득한 뱃지가 없습니다</Text>
            )}
          </View>
        ) : null}
      />
      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onPurchase={handlePurchase}
        loading={paywallLoading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  heatmapWrapper: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  center: {
    flex: 1,
    backgroundColor: theme.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { color: theme.textMuted, fontSize: 14 },
  header: {
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.text,
    letterSpacing: 0.3,
  },
  headerSub: { fontSize: 13, color: theme.textMuted, marginTop: 4 },
  bookRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bookInfo: { flex: 1 },
  bookName: { fontSize: 15, fontWeight: '600', color: theme.text },
  bookProgress: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  progressBar: {
    width: 72,
    height: 3,
    backgroundColor: theme.goldBg,
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.goldBorder,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.gold,
    borderRadius: 2,
  },
  chapterRow: {
    paddingHorizontal: 36,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  chapterNum: { fontSize: 14, color: theme.textSub },
  chapterDone: { color: theme.gold, fontWeight: '600' },
  // 뱃지 섹션
  badgeSection: {
    padding: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    marginTop: 8,
  },
  badgeSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  badgeSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
  },
  badgeSeeAll: {
    fontSize: 12,
    color: theme.gold,
    fontWeight: '600',
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeItem: {
    width: '22%' as any,
    alignItems: 'center',
    gap: 4,
  },
  badgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeName: {
    fontSize: 10,
    color: theme.textMuted,
    textAlign: 'center',
  },
  badgeEmpty: {
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    paddingVertical: 16,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(212,168,71,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.gold,
    letterSpacing: 0.5,
  },
});

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { generateRecommendation, getPoolRecommendation, type RecommendVerse } from '../utils/ai-meditation';
import { getAppUserId, checkAIEntitlement, purchasePremium } from '../utils/subscriptions';
import PaywallSheet from '../components/PaywallSheet';

// ── 테마 프리셋 ───────────────────────────────────────────────────────────────

const THEME_PRESETS = [
  { label: '위로', icon: 'heart-outline' },
  { label: '두려움', icon: 'shield-outline' },
  { label: '감사', icon: 'hand-heart-outline' },
  { label: '기쁨', icon: 'star-outline' },
  { label: '지혜', icon: 'lightbulb-outline' },
  { label: '용기', icon: 'arm-flex-outline' },
  { label: '슬픔', icon: 'water-outline' },
  { label: '소망', icon: 'weather-sunset' },
  { label: '믿음', icon: 'cross-outline' },
  { label: '평안', icon: 'leaf-maple-outline' },
  { label: '관계', icon: 'account-group-outline' },
  { label: '재정', icon: 'cash-remove' },
  { label: '건강', icon: 'heart-pulse' },
  { label: '직장', icon: 'briefcase-outline' },
  { label: '결정', icon: 'crosshairs-question' },
  { label: '외로움', icon: 'account-outline' },
] as const;

// ── ref 파싱: "요한복음 3:16" → { bookId, chapter, verse } ────────────────────

function parseVerseRef(ref: string): { bookId: string | null; chapter: number | null; verse: number | null } {
  // Match patterns like "요한복음 3:16" or "창세기 1장 1절"
  const colonMatch = ref.match(/^(.+?)\s+(\d+):(\d+)/);
  if (colonMatch) {
    return { bookId: colonMatch[1].trim(), chapter: parseInt(colonMatch[2]), verse: parseInt(colonMatch[3]) };
  }
  const chapterMatch = ref.match(/^(.+?)\s+(\d+)장/);
  if (chapterMatch) {
    return { bookId: chapterMatch[1].trim(), chapter: parseInt(chapterMatch[2]), verse: null };
  }
  return { bookId: null, chapter: null, verse: null };
}

// ── 책 이름 → bookId 매핑 (약식) ─────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BOOK_NAME_MAP: Record<string, string> = {
  '창세기': '1', '출애굽기': '2', '레위기': '3', '민수기': '4', '신명기': '5',
  '여호수아': '6', '사사기': '7', '룻기': '8', '사무엘상': '9', '사무엘하': '10',
  '열왕기상': '11', '열왕기하': '12', '역대상': '13', '역대하': '14',
  '에스라': '15', '느헤미야': '16', '에스더': '17', '욥기': '18',
  '시편': '19', '잠언': '20', '전도서': '21', '아가': '22',
  '이사야': '23', '예레미야': '24', '예레미야애가': '25', '에스겔': '26',
  '다니엘': '27', '호세아': '28', '요엘': '29', '아모스': '30',
  '오바댜': '31', '요나': '32', '미가': '33', '나훔': '34',
  '하박국': '35', '스바냐': '36', '학개': '37', '스가랴': '38', '말라기': '39',
  '마태복음': '40', '마가복음': '41', '누가복음': '42', '요한복음': '43',
  '사도행전': '44', '로마서': '45', '고린도전서': '46', '고린도후서': '47',
  '갈라디아서': '48', '에베소서': '49', '빌립보서': '50', '골로새서': '51',
  '데살로니가전서': '52', '데살로니가후서': '53', '디모데전서': '54', '디모데후서': '55',
  '디도서': '56', '빌레몬서': '57', '히브리서': '58', '야고보서': '59',
  '베드로전서': '60', '베드로후서': '61', '요한일서': '62', '요한이서': '63',
  '요한삼서': '64', '유다서': '65', '요한계시록': '66',
};

export default function RecommendVersesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RecommendVerse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallLoading, setPaywallLoading] = useState(false);

  const activeTheme = selectedTheme ?? (customInput.trim() || null);

  const isPreset = selectedTheme !== null && THEME_PRESETS.some(p => p.label === selectedTheme);

  // 프리셋 태그 선택 즉시 자동 조회 (로컬 풀, 딜레이 없음)
  useEffect(() => {
    if (!selectedTheme) return;
    setError(null);
    const result = getPoolRecommendation(selectedTheme);
    if (result.error || !result.data) {
      setResults(null);
      setError('구절을 불러오지 못했습니다. 앱을 다시 시작해 주세요.');
    } else {
      setResults(result.data);
    }
  }, [selectedTheme]);

  // 커스텀 입력으로 전환 시 이전 결과 초기화
  useEffect(() => {
    if (customInput.trim()) {
      setResults(null);
      setError(null);
    }
  }, [customInput]);

  // 커스텀 입력 전용 (프리셋은 useEffect에서 자동 처리)
  const handleSearch = useCallback(async () => {
    const queryTheme = customInput.trim();
    if (!queryTheme || isPreset) return;

    setLoading(true);
    setError(null);
    setResults(null);

    const [userId, entitled] = await Promise.all([getAppUserId(), checkAIEntitlement()]);
    if (!entitled) {
      setLoading(false);
      setShowPaywall(true);
      return;
    }

    const result = await generateRecommendation(queryTheme, userId);
    setLoading(false);

    if (result.error || !result.data) {
      setError('추천 구절을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } else {
      setResults(result.data);
    }
  }, [customInput, isPreset]);

  async function handlePurchase() {
    setPaywallLoading(true);
    const result = await purchasePremium();
    setPaywallLoading(false);
    if (result.success) setShowPaywall(false);
  }

  function navigateToVerse(ref: string) {
    const { bookId: bookName, chapter, verse } = parseVerseRef(ref);
    if (!bookName || !chapter) return;
    const bookId = BOOK_NAME_MAP[bookName];
    if (!bookId) return;
    const url = verse
      ? `/read/${bookId}/${chapter}?verse=${verse}`
      : `/read/${bookId}/${chapter}`;
    router.push(url as Parameters<typeof router.push>[0]);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>테마별 구절 추천</Text>
        <View style={{ width: 38 }} />
      </View>

      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onPurchase={handlePurchase}
        loading={paywallLoading}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 직접 입력 */}
        <View style={styles.inputLabel}>
          <Text style={[styles.inputLabelText, { color: theme.textMuted }]}>직접 입력</Text>
          <View style={styles.inputProBadge}>
            <MaterialCommunityIcons name="crown" size={10} color={theme.gold} />
            <Text style={[styles.inputProBadgeText, { color: theme.gold }]}>Pro</Text>
          </View>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            placeholder="마음 상태나 상황을 입력하세요"
            placeholderTextColor={theme.textMuted}
            value={customInput}
            onChangeText={t => { setCustomInput(t); setSelectedTheme(null); }}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          <Pressable
            style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.8 }, !activeTheme && { opacity: 0.4 }]}
            onPress={handleSearch}
            disabled={!activeTheme || loading}
          >
            <MaterialCommunityIcons name="magnify" size={20} color={theme.bg} />
          </Pressable>
        </View>

        {/* 프리셋 칩 */}
        <View style={styles.chips}>
          {THEME_PRESETS.map(p => {
            const active = selectedTheme === p.label;
            return (
              <Pressable
                key={p.label}
                style={[
                  styles.chip,
                  active && styles.chipActive,
                ]}
                onPress={() => {
                  setSelectedTheme(active ? null : p.label);
                  setCustomInput('');
                }}
              >
                <MaterialCommunityIcons
                  name={p.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                  size={13}
                  color={active ? theme.bg : theme.textSub}
                />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* 검색 버튼 (커스텀 입력 전용) */}
        {!isPreset && customInput.trim() && !loading && !results && (
          <Pressable
            style={({ pressed }) => [styles.searchCTA, pressed && { opacity: 0.85 }]}
            onPress={handleSearch}
          >
            <MaterialCommunityIcons name="compass-rose" size={16} color={theme.bg} />
            <Text style={styles.searchCTAText}>"{customInput.trim()}" 관련 구절 찾기</Text>
          </Pressable>
        )}

        {/* 로딩 */}
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.gold} size="large" />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>말씀을 찾고 있습니다...</Text>
          </View>
        )}

        {/* 에러 */}
        {error && (
          <View style={styles.errorWrap}>
            <MaterialCommunityIcons name="alert-circle-outline" size={32} color={theme.textMuted} />
            <Text style={[styles.errorText, { color: theme.textMuted }]}>{error}</Text>
          </View>
        )}

        {/* 결과 */}
        {results && results.length > 0 && (
          <View style={styles.results}>
            <Text style={[styles.resultsLabel, { color: theme.textMuted }]}>
              "{activeTheme}"에 관한 말씀 {results.length}개
            </Text>
            {results.map((v, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.verseCard, pressed && { opacity: 0.8 }]}
                onPress={() => navigateToVerse(v.ref)}
              >
                <View style={styles.verseCardTop}>
                  <Text style={[styles.verseRef, { color: theme.gold }]}>{v.ref}</Text>
                  <MaterialCommunityIcons name="open-in-new" size={14} color={theme.textMuted} />
                </View>
                <Text style={[styles.verseText, { color: theme.text }]}>{v.text}</Text>
                <View style={styles.verseDivider} />
                <Text style={[styles.verseReason, { color: theme.textSub }]}>{v.reason}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.borderSubtle,
  },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: theme.text },

  // Content
  scroll: { padding: 20, gap: 16 },

  // Input
  inputLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: -8 },
  inputLabelText: { fontSize: 12, fontWeight: '600' },
  inputProBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 5, borderWidth: 1,
    borderColor: `${theme.gold}50`, backgroundColor: `${theme.gold}18`,
  },
  inputProBadgeText: { fontSize: 10, fontWeight: '700' },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    backgroundColor: theme.surface,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Chips
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    backgroundColor: theme.surface,
  },
  chipActive: {
    backgroundColor: theme.gold,
    borderColor: theme.gold,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.textSub },
  chipTextActive: { color: theme.bg },

  // Search CTA
  searchCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.gold,
    borderRadius: 14,
    paddingVertical: 14,
  },
  searchCTAText: { fontSize: 15, fontWeight: '800', color: theme.bg, letterSpacing: 0.2 },

  // Loading / error
  loadingWrap: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  loadingText: { fontSize: 14 },
  errorWrap: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  errorText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },

  // Results
  results: { gap: 12 },
  resultsLabel: { fontSize: 12, marginBottom: 4 },
  verseCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  verseCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  verseRef: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  verseText: { fontSize: 15, lineHeight: 23, fontWeight: '500' },
  verseDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)' },
  verseReason: { fontSize: 13, lineHeight: 19 },
});

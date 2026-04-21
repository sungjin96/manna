import { useState, useCallback, useRef, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { searchVerses, parseReference, SearchResult, BookReference } from '../../db/bible';
import { BOOKS } from '../../constants/books';
import { theme } from '../../constants/theme';
import {
  getSearchHistory,
  addSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
} from '../../utils/search-history';

function highlight(text: string, query: string): { part: string; match: boolean }[] {
  if (!query.trim()) return [{ part: text, match: false }];
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map(part => ({ part, match: regex.test(part) }));
}

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [reference, setReference] = useState<BookReference | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 포커스 시마다 히스토리 로드 (다른 탭 이동 후 돌아와도 최신 유지)
  useFocusEffect(
    useCallback(() => {
      if (!query.trim()) {
        getSearchHistory().then(setHistory);
      }
    }, [query])
  );

  function handleQueryChange(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setResults([]);
      setReference(null);
      setSearched(false);
      return;
    }
    setReference(parseReference(text));
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const found = await searchVerses(text);
        setResults(found);
        // 히스토리 저장
        await addSearchHistory(text.trim());
        setHistory(await getSearchHistory());
      } finally {
        setLoading(false);
      }
    }, 350);
  }

  function handleClear() {
    setQuery('');
    setResults([]);
    setReference(null);
    setSearched(false);
  }

  function handleHistoryTap(item: string) {
    handleQueryChange(item);
  }

  async function handleHistoryRemove(item: string) {
    const updated = await removeSearchHistory(item);
    setHistory(updated);
  }

  async function handleHistoryClear() {
    await clearSearchHistory();
    setHistory([]);
  }

  const showHistory = !query.trim() && history.length > 0;

  const renderResult = useCallback(({ item }: { item: SearchResult }) => {
    const book = BOOKS.find(b => b.id === item.bookId);
    const ref = `${book?.name ?? ''} ${item.chapter}:${item.verse}`;
    const segments = highlight(item.text, query);

    return (
      <Pressable
        style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
        onPress={() => router.push(`/read/${item.bookId}/${item.chapter}?verse=${item.verse}`)}
      >
        <Text style={styles.resultRef}>{ref}</Text>
        <Text style={styles.resultText} numberOfLines={3}>
          {segments.map((seg, i) =>
            seg.match
              ? <Text key={i} style={styles.resultHighlight}>{seg.part}</Text>
              : seg.part
          )}
        </Text>
      </Pressable>
    );
  }, [query]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>성경 검색</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={20} color={theme.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="말씀 검색..."
          placeholderTextColor={theme.textMuted}
          value={query}
          onChangeText={handleQueryChange}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <Pressable onPress={handleClear} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={18} color={theme.textMuted} />
          </Pressable>
        )}
      </View>

      {/* 히스토리 (query 비어있을 때) */}
      {showHistory && (
        <View style={styles.historySection}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyLabel}>최근 검색</Text>
            <Pressable onPress={handleHistoryClear} hitSlop={8}>
              <Text style={styles.historyClearAll}>전체 삭제</Text>
            </Pressable>
          </View>
          {history.map(item => (
            <View key={item} style={styles.historyRow}>
              <Pressable
                style={styles.historyItem}
                onPress={() => handleHistoryTap(item)}
              >
                <MaterialCommunityIcons name="history" size={16} color={theme.textMuted} />
                <Text style={styles.historyText} numberOfLines={1}>{item}</Text>
              </Pressable>
              <Pressable onPress={() => handleHistoryRemove(item)} hitSlop={8} style={styles.historyRemove}>
                <MaterialCommunityIcons name="close" size={16} color={theme.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* 빈 상태 (히스토리도 없고 검색도 안 한 상태) */}
      {!showHistory && !query.trim() && (
        <View style={styles.center}>
          <MaterialCommunityIcons name="magnify" size={40} color={theme.textMuted} />
          <Text style={styles.emptyText}>말씀을 검색해보세요</Text>
          <Text style={styles.emptyHint}>구절, 단어, 책 이름으로 찾을 수 있어요</Text>
        </View>
      )}

      {/* Results */}
      {query.trim() ? (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.gold} />
          </View>
        ) : searched && results.length === 0 && !reference ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="text-search" size={40} color={theme.textMuted} />
            <Text style={styles.emptyText}>검색 결과가 없습니다</Text>
            <Text style={styles.emptyHint}>다른 단어로 검색해보세요</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={item => `${item.bookId}-${item.chapter}-${item.verse}`}
            renderItem={renderResult}
            contentContainerStyle={styles.list}
            keyboardDismissMode="on-drag"
            ListHeaderComponent={
              <>
                {reference && (
                  <Pressable
                    style={({ pressed }) => [styles.refCard, pressed && styles.refCardPressed]}
                    onPress={() => router.push(`/read/${reference.bookId}/${reference.chapter}`)}
                  >
                    <View style={styles.refCardLeft}>
                      <MaterialCommunityIcons name="book-open-variant" size={18} color={theme.gold} />
                      <View>
                        <Text style={styles.refCardTitle}>
                          {reference.bookName} {reference.chapter}장
                          {reference.verse ? ` ${reference.verse}절` : ''}
                        </Text>
                        <Text style={styles.refCardSub}>직접 이동</Text>
                      </View>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
                  </Pressable>
                )}
                {results.length > 0 && (
                  <Text style={styles.resultCount}>{results.length}개 결과</Text>
                )}
              </>
            }
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },

  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.text,
    padding: 0,
  },

  // History
  historySection: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  historyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  historyClearAll: {
    fontSize: 12,
    color: theme.textMuted,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  historyItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyText: {
    flex: 1,
    fontSize: 15,
    color: theme.text,
  },
  historyRemove: {
    paddingLeft: 12,
  },

  list: { paddingBottom: 40 },

  resultCount: {
    fontSize: 12,
    color: theme.textMuted,
    paddingHorizontal: 20,
    paddingBottom: 8,
    letterSpacing: 0.5,
  },

  resultRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
    gap: 4,
  },
  resultRowPressed: { backgroundColor: theme.surface },

  resultRef: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.gold,
    letterSpacing: 0.3,
  },
  resultText: {
    fontSize: 15,
    color: theme.textSub,
    lineHeight: 22,
  },
  resultHighlight: {
    color: theme.goldLight,
    fontWeight: '700',
    backgroundColor: `${theme.gold}20`,
  },

  refCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: `${theme.gold}12`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${theme.gold}30`,
  },
  refCardPressed: { opacity: 0.7 },
  refCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  refCardTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
  refCardSub: { fontSize: 12, color: theme.gold, marginTop: 1 },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 80,
  },
  emptyText: { fontSize: 16, color: theme.textMuted, marginTop: 12 },
  emptyHint: { fontSize: 13, color: theme.textMuted },
});

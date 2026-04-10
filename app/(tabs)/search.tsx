import { useState, useCallback, useRef } from 'react';
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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setResults([]);
      setReference(null);
      setSearched(false);
      return;
    }
    // Reference parse is synchronous — update immediately
    setReference(parseReference(text));
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setSearched(true);
      try {
        const found = await searchVerses(text);
        setResults(found);
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

  const renderResult = useCallback(({ item }: { item: SearchResult }) => {
    const book = BOOKS.find(b => b.id === item.bookId);
    const ref = `${book?.name ?? ''} ${item.chapter}:${item.verse}`;
    const segments = highlight(item.text, query);

    return (
      <Pressable
        style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
        onPress={() => router.push(`/read/${item.bookId}/${item.chapter}`)}
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

      {/* Results */}
      {loading ? (
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
      )}
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

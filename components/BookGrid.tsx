import { useCallback } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BOOKS } from '../constants/books';
import { theme } from '../constants/theme';

const SCREEN_W = Dimensions.get('window').width;
const GRID_PADDING = 20;
const TILE_GAP = 6;
// 더 큰 타일: 한 줄에 ~7개 (40~50대 가독성)
const COLS = Math.max(6, Math.floor((SCREEN_W - GRID_PADDING * 2 + TILE_GAP) / (50 + TILE_GAP)));
const TILE_SIZE = Math.floor((SCREEN_W - GRID_PADDING * 2 - (COLS - 1) * TILE_GAP) / COLS);

function shortName(name: string): string {
  const map: Record<string, string> = {
    '창세기': '창', '출애굽기': '출', '레위기': '레', '민수기': '민', '신명기': '신',
    '여호수아': '수', '사사기': '삿', '룻기': '룻', '사무엘상': '삼상', '사무엘하': '삼하',
    '열왕기상': '왕상', '열왕기하': '왕하', '역대상': '대상', '역대하': '대하',
    '에스라': '스', '느헤미야': '느', '에스더': '더', '욥기': '욥',
    '시편': '시', '잠언': '잠', '전도서': '전', '아가': '아',
    '이사야': '사', '예레미야': '렘', '예레미야애가': '애', '에스겔': '겔',
    '다니엘': '단', '호세아': '호', '요엘': '욜', '아모스': '암',
    '오바댜': '옵', '요나': '욘', '미가': '미', '나훔': '나',
    '하박국': '합', '스바냐': '습', '학개': '학', '스가랴': '슥', '말라기': '말',
    '마태복음': '마', '마가복음': '막', '누가복음': '눅', '요한복음': '요',
    '사도행전': '행', '로마서': '롬', '고린도전서': '고전', '고린도후서': '고후',
    '갈라디아서': '갈', '에베소서': '엡', '빌립보서': '빌', '골로새서': '골',
    '데살로니가전서': '살전', '데살로니가후서': '살후',
    '디모데전서': '딤전', '디모데후서': '딤후', '디도서': '딛',
    '빌레몬서': '몬', '히브리서': '히', '야고보서': '약',
    '베드로전서': '벧전', '베드로후서': '벧후',
    '요한일서': '요일', '요한이서': '요이', '요한삼서': '요삼',
    '유다서': '유', '요한계시록': '계',
  };
  return map[name] ?? name.slice(0, 2);
}

interface Props {
  completed: Set<string>;
  onBookPress: (bookId: number) => void;
}

export default function BookGrid({ completed, onBookPress }: Props) {
  const otBooks = BOOKS.filter(b => b.testament === 'old');
  const ntBooks = BOOKS.filter(b => b.testament === 'new');

  const getBookProgress = useCallback((bookId: number, chapters: number) => {
    let done = 0;
    for (let ch = 1; ch <= chapters; ch++) {
      if (completed.has(`${bookId}:${ch}`)) done++;
    }
    return done;
  }, [completed]);

  function renderTile(book: typeof BOOKS[0]) {
    const done = getBookProgress(book.id, book.chapters);
    const pct = done / book.chapters;
    const isComplete = pct === 1;
    const isPartial = pct > 0 && pct < 1;

    return (
      <Pressable
        key={book.id}
        style={[
          styles.tile,
          isComplete && styles.tileComplete,
          isPartial && styles.tilePartial,
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onBookPress(book.id);
        }}
        accessibilityLabel={`${book.name}, ${done}/${book.chapters} 챕터 완료`}
        accessibilityRole="button"
      >
        <Text
          style={[
            styles.tileName,
            isComplete && styles.tileNameComplete,
            isPartial && styles.tileNamePartial,
          ]}
          numberOfLines={1}
        >
          {shortName(book.name)}
        </Text>
        {isPartial && (
          <View style={styles.tileBar}>
            <View style={[styles.tileBarFill, { width: `${pct * 100}%` as any }]} />
          </View>
        )}
        {isComplete && (
          <MaterialCommunityIcons name="check" size={10} color={theme.bg} />
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>구약 {otBooks.length}</Text>
      <View style={styles.grid}>
        {otBooks.map(renderTile)}
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>신약 {ntBooks.length}</Text>
      <View style={styles.grid}>
        {ntBooks.map(renderTile)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tileComplete: {
    backgroundColor: theme.gold,
    borderColor: theme.gold,
  },
  tilePartial: {
    backgroundColor: 'rgba(212,168,71,0.12)',
    borderColor: 'rgba(212,168,71,0.3)',
  },
  tileName: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
  },
  tileNameComplete: {
    color: theme.bg,
  },
  tileNamePartial: {
    color: theme.gold,
  },
  tileBar: {
    width: '70%',
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(212,168,71,0.2)',
    overflow: 'hidden',
  },
  tileBarFill: {
    height: '100%',
    backgroundColor: theme.gold,
    borderRadius: 1,
  },
});

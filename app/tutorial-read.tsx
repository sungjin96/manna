/**
 * TutorialReadScreen
 *
 * 실제 읽기 화면처럼 보이지만 고정 콘텐츠(창세기 1장)를 사용하는 튜토리얼 전용 화면.
 * 레이아웃이 고정되어 있어 오버레이 좌표가 항상 정확하게 맞는다.
 * 튜토리얼 완료 후 사용자가 원래 열려고 했던 장(bookId/chapter)으로 이동한다.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useReaderSettings } from '../hooks/useReaderSettings';
import { useTutorial } from '../hooks/useTutorial';
import { ReadingTutorial } from '../components/ReadingTutorial';
import { HEADER_H, PROGRESS_H } from './read/[bookId]/chapter.styles';

// 창세기 1장 첫 5절 (KRV) — 고정 콘텐츠
const TUTORIAL_VERSES = [
  { verse: 1, text: '태초에 하나님이 천지를 창조하시니라' },
  { verse: 2, text: '땅이 혼돈하고 공허하며 흑암이 깊음 위에 있고 하나님의 영은 수면 위에 운행하시니라' },
  { verse: 3, text: '하나님이 이르시되 빛이 있으라 하시니 빛이 있었고' },
  { verse: 4, text: '빛이 하나님이 보시기에 좋았더라 하나님이 빛과 어둠을 나누사' },
  { verse: 5, text: '하나님이 빛을 낮이라 부르시고 어둠을 밤이라 부르시니라 저녁이 되고 아침이 되니 이는 첫째 날이니라' },
];

export default function TutorialReadScreen() {
  const { bookId, chapter } = useLocalSearchParams<{ bookId: string; chapter: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [readVerses, setReadVerses] = useState<Set<number>>(new Set());

  const { colors, settings } = useReaderSettings();

  const { isActive, step, overlayOpacity, advanceStep, dismiss } = useTutorial(() => {
    router.replace(`/read/${bookId}/${chapter}`);
  });

  function toggleVerse(verse: number) {
    setReadVerses(prev => {
      const next = new Set(prev);
      if (next.has(verse)) next.delete(verse); else next.add(verse);
      return next;
    });
  }

  return (
    <View style={[s.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>

      {/* 헤더 */}
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <Pressable style={s.backBtn} onPress={dismiss} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.gold} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.text }]}>창세기 1장</Text>
        <View style={s.headerRight}>
          <MaterialCommunityIcons name="headphones" size={20} color={colors.muted} style={s.headerIcon} />
          <MaterialCommunityIcons name="cog-outline" size={20} color={colors.muted} style={s.headerIcon} />
        </View>
      </View>

      {/* 진행률 스트립 */}
      <View style={[s.progressStrip, { borderTopColor: colors.border }]}>
        <View style={[s.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[s.progressFill, { width: `${(readVerses.size / 31) * 100}%`, backgroundColor: colors.gold }]} />
        </View>
        <Text style={[s.progressLabel, { color: colors.muted }]}>
          {readVerses.size} / 31 절
        </Text>
      </View>

      {/* 구절 목록 + 완료 버튼 */}
      <FlatList
        ref={flatListRef}
        data={TUTORIAL_VERSES}
        keyExtractor={item => String(item.verse)}
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const isRead = readVerses.has(item.verse);
          return (
            <Pressable
              style={s.verseRow}
              onPress={() => toggleVerse(item.verse)}
            >
              <Text style={[s.verseNum, { color: colors.gold }]}>{item.verse}</Text>
              <Text
                style={[
                  s.verseText,
                  {
                    color: colors.text,
                    fontSize: settings.fontSize,
                    lineHeight: settings.fontSize * settings.lineHeight,
                  },
                  isRead && s.verseRead,
                ]}
              >
                {item.text}
              </Text>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <Pressable style={s.completeBtn}>
            <Text style={s.completeBtnText}>읽기 완료</Text>
          </Pressable>
        }
      />

      {/* 하단 네비게이션 */}
      <View
        style={[
          s.bottomNav,
          { backgroundColor: colors.bg, borderTopColor: colors.border, paddingBottom: insets.bottom + 4 },
        ]}
      >
        <Pressable style={s.navBtn}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.muted} />
          <Text style={[s.navText, { color: colors.muted }]}>이전</Text>
        </Pressable>
        <Pressable style={s.navBtn}>
          <Text style={[s.navText, { color: colors.muted }]}>다음</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
        </Pressable>
      </View>

      {/* 튜토리얼 오버레이 */}
      {isActive && (
        <ReadingTutorial
          step={step}
          overlayOpacity={overlayOpacity}
          onNext={advanceStep}
          onDismiss={dismiss}
          onScrollToEnd={() => {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_H,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: { padding: 8 },

  progressStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: PROGRESS_H,
  },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressLabel: { fontSize: 11, letterSpacing: 0.3, minWidth: 48, textAlign: 'right' },

  list: { padding: 20, paddingBottom: 100 },
  verseRow: { flexDirection: 'row', marginBottom: 14, gap: 10, paddingHorizontal: 4, paddingVertical: 2 },
  verseNum: { fontSize: 11, width: 22, paddingTop: 4, fontWeight: '700', opacity: 0.7 },
  verseText: { flex: 1 },
  verseRead: { opacity: 0.35 },

  completeBtn: {
    marginTop: 32,
    backgroundColor: '#D4A847',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  completeBtnText: { fontSize: 16, fontWeight: '700', color: '#0B0A12', letterSpacing: 0.3 },

  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingHorizontal: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  navText: { fontSize: 14, fontWeight: '600' },
});

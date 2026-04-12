/**
 * VerseShareCard
 *
 * 성경 구절을 이미지 카드로 캡처해서 공유하는 컴포넌트.
 * verseShareData가 설정되면 자동으로 마운트 → 캡처 → 공유 → onDone 호출.
 */
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
  verses: { verse: number; text: string }[];
  onDone: () => void;
}

const CARD_W = 360;
const MAX_VERSES = 5;

export default function VerseShareCard({ bookName, chapter, verseStart, verseEnd, verses, onDone }: Props) {
  const cardRef = useRef<ViewShot>(null);

  const refLabel = `${bookName} ${chapter}:${verseStart}${verseEnd && verseEnd !== verseStart ? `–${verseEnd}` : ''}`;
  const displayVerses = verses.slice(0, MAX_VERSES);
  const hasMore = verses.length > MAX_VERSES;

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '구절 공유' });
        }
      } catch {
        // Share cancelled or failed silently
      } finally {
        onDone();
      }
    }, 120);

    return () => clearTimeout(timer);
  }, []);

  return (
    <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={styles.offscreen}>
      <View style={card.container}>
        {/* 헤더: 로고 */}
        <View style={card.header}>
          <MaterialCommunityIcons name="cross" size={13} color="rgba(212,168,71,0.40)" />
          <Text style={card.logoText}>MANNA</Text>
        </View>

        <View style={card.divider} />

        {/* 구절 참조 */}
        <Text style={card.ref}>{refLabel}</Text>

        {/* 구절 본문 */}
        <View style={card.versesWrap}>
          {displayVerses.map(v => (
            <View key={v.verse} style={card.verseRow}>
              <Text style={card.verseNum}>{v.verse}</Text>
              <Text style={card.verseText}>{v.text}</Text>
            </View>
          ))}
          {hasMore && <Text style={card.moreText}>...</Text>}
        </View>

        {/* 푸터 */}
        <View style={card.footer}>
          <Text style={card.footerText}>만나 앱에서 말씀 읽기</Text>
        </View>
      </View>
    </ViewShot>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    top: -9999,
    left: -9999,
    width: CARD_W,
  },
});

const card = StyleSheet.create({
  container: {
    width: CARD_W,
    backgroundColor: '#0B0A12',
    borderRadius: 20,
    overflow: 'hidden',
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  logoText: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(212,168,71,0.40)',
    letterSpacing: 3,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(212,168,71,0.12)',
    marginBottom: 20,
  },
  ref: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D4A847',
    letterSpacing: 0.3,
    marginBottom: 16,
    textAlign: 'center',
  },
  versesWrap: {
    gap: 12,
    marginBottom: 20,
  },
  verseRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  verseNum: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(212,168,71,0.55)',
    width: 18,
    paddingTop: 3,
    textAlign: 'right',
  },
  verseText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 26,
    color: '#E8E4D9',
    letterSpacing: 0.2,
  },
  moreText: {
    fontSize: 14,
    color: 'rgba(232,228,217,0.35)',
    textAlign: 'center',
    marginTop: 4,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 14,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    color: 'rgba(212,168,71,0.30)',
    letterSpacing: 0.5,
  },
});

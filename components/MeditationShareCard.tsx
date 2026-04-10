/**
 * MeditationShareCard
 *
 * 묵상 기록을 이미지 카드로 캡처해서 공유하는 컴포넌트.
 * - ViewShot으로 카드 렌더 → PNG 캡처
 * - expo-sharing으로 시스템 공유 시트 열기
 *
 * 주의: react-native-view-shot은 네이티브 모듈이므로 EAS Build 필요.
 *       Expo Go에서는 동작하지 않음.
 */
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

interface Props {
  verseRef: string;     // e.g. "요한복음 3:16"
  noteText: string;     // 묵상 내용 (plain text, already parsed from QA format)
  date: string;         // formatted date string
  isPro?: boolean;      // Pro 유저 여부 (워터마크 제어)
}

export default function MeditationShareCard({ verseRef, noteText, date, isPro }: Props) {
  const cardRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '묵상 공유' });
      }
    } catch {
      // Sharing canceled or unavailable — silent failure
    } finally {
      setSharing(false);
    }
  }

  return (
    <View>
      {/* Hidden capture target — rendered off-screen layout trick */}
      <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={styles.captureWrap}>
        <ShareCardDesign verseRef={verseRef} noteText={noteText} date={date} isPro={isPro} />
      </ViewShot>

      {/* Share button — padding:4 로 edit/delete 아이콘과 수직 정렬 */}
      <Pressable onPress={handleShare} hitSlop={8} disabled={sharing} style={{ padding: 4 }}>
        {sharing
          ? <ActivityIndicator size="small" color={theme.textMuted} />
          : <MaterialCommunityIcons name="share-variant-outline" size={18} color={theme.textMuted} />
        }
      </Pressable>
    </View>
  );
}

/** The actual card design that gets captured */
function ShareCardDesign({ verseRef, noteText, date, isPro }: Props) {
  const displayNote = noteText.length > 200 ? noteText.slice(0, 200) + '...' : noteText;

  return (
    <View style={card.container}>
      {/* Logo — 중앙 정렬 */}
      <View style={card.logoRow}>
        <MaterialCommunityIcons name="cross" size={16} color="#D4A847" />
        <Text style={card.logoText}>MANNA</Text>
      </View>

      {/* 구절 인용 블록 */}
      <View style={card.quoteBlock}>
        <Text style={card.quoteText}>{'\u201C'}{verseRef.replace(/.*?\d+:\d+/, (m) => m)}{'\u201D'}</Text>
        <Text style={card.quoteRef}>{verseRef}</Text>
      </View>

      {/* 묵상 구분선 */}
      <View style={card.divider} />

      {/* 묵상 내용 */}
      <Text style={card.note}>{displayNote}</Text>

      {/* 푸터 */}
      <View style={card.footer}>
        <Text style={card.date}>{date}</Text>
        <Text style={card.tagline}>만나 - AI 성경 묵상</Text>
      </View>

      {/* Free 유저 워터마크 */}
      {!isPro && (
        <Text style={card.watermark}>만나 앱에서 묵상하기</Text>
      )}
    </View>
  );
}

const CARD_W = 360;

const styles = StyleSheet.create({
  captureWrap: {
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
    padding: 28,
    paddingTop: 32,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 24,
  },
  logoText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D4A847',
    letterSpacing: 3,
  },
  quoteBlock: {
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  quoteText: {
    fontSize: 15,
    fontWeight: '600',
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 8,
  },
  quoteRef: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D4A847',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(212,168,71,0.15)',
    marginBottom: 18,
    marginHorizontal: 20,
  },
  note: {
    fontSize: 14,
    lineHeight: 23,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
    gap: 4,
  },
  date: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },
  tagline: {
    fontSize: 10,
    color: 'rgba(212,168,71,0.4)',
    letterSpacing: 0.5,
  },
  watermark: {
    fontSize: 9,
    color: 'rgba(212,168,71,0.25)',
    textAlign: 'center',
    marginTop: 12,
    letterSpacing: 0.5,
  },
});

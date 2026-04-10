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
}

export default function MeditationShareCard({ verseRef, noteText, date }: Props) {
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
        <ShareCardDesign verseRef={verseRef} noteText={noteText} date={date} />
      </ViewShot>

      {/* Share button */}
      <Pressable onPress={handleShare} hitSlop={8} disabled={sharing}>
        {sharing
          ? <ActivityIndicator size="small" color={theme.textMuted} />
          : <MaterialCommunityIcons name="share-variant-outline" size={18} color={theme.textMuted} />
        }
      </Pressable>
    </View>
  );
}

/** The actual card design that gets captured */
function ShareCardDesign({ verseRef, noteText, date }: Props) {
  // Truncate note to keep card readable
  const displayNote = noteText.length > 200 ? noteText.slice(0, 200) + '...' : noteText;

  return (
    <View style={card.container}>
      {/* Top accent bar */}
      <View style={card.accentBar} />

      {/* Logo */}
      <View style={card.logoRow}>
        <MaterialCommunityIcons name="cross" size={14} color={theme.gold} />
        <Text style={card.logoText}>MANNA</Text>
      </View>

      {/* Verse ref */}
      <Text style={card.ref}>{verseRef}</Text>

      {/* Note */}
      <Text style={card.note}>{displayNote}</Text>

      {/* Footer */}
      <View style={card.footer}>
        <Text style={card.date}>{date}</Text>
      </View>
    </View>
  );
}

const CARD_W = 320;

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
    padding: 24,
    paddingTop: 20,
  },
  accentBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
    backgroundColor: '#D4A847',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 20,
    opacity: 0.6,
  },
  logoText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D4A847',
    letterSpacing: 2,
  },
  ref: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D4A847',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  note: {
    fontSize: 15,
    lineHeight: 24,
    color: '#FFFFFF',
    flex: 1,
  },
  footer: {
    marginTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(212,168,71,0.2)',
    paddingTop: 12,
  },
  date: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
});

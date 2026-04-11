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
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { getVerseRange } from '../db/bible';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

interface Props {
  verseRef: string;     // e.g. "요한복음 3:16"
  noteText: string;     // 묵상 내용 (plain text, already parsed from QA format)
  date: string;         // formatted date string
  isPro?: boolean;      // Pro 유저 여부 (워터마크 제어)
  bookId?: number;
  chapter?: number;
  verseStart?: number;
  verseEnd?: number;
}

/** Q&A 형식 파싱: JSON 또는 "Q1. 질문\n답변" 텍스트 패턴 감지 */
function parseQA(text: string): { q: string; a: string }[] | null {
  // 1) JSON 형식 (DB 저장 포맷)
  try {
    const parsed = JSON.parse(text);
    if (parsed?.type === 'qa' && Array.isArray(parsed.entries)) {
      const valid = parsed.entries.filter((e: { q: string; a: string }) => e.q || e.a);
      return valid.length > 0 ? valid : null;
    }
  } catch {}

  // 2) 텍스트 형식 (renderNotePreview 출력)
  const blocks = text.split(/\n\n+/);
  const entries: { q: string; a: string }[] = [];
  for (const block of blocks) {
    const match = block.match(/^Q\d+\.\s*(.+?)(?:\n([\s\S]*))?$/);
    if (match) {
      entries.push({ q: match[1].trim(), a: (match[2] ?? '').trim() });
    }
  }
  return entries.length > 0 ? entries : null;
}

export default function MeditationShareCard({ verseRef, noteText, date, isPro, bookId, chapter, verseStart, verseEnd }: Props) {
  const cardRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  function buildShareUrl(): string {
    if (!bookId || !chapter) return '';
    let url = `https://manna-ai-proxy.sungjin5891.workers.dev/share?b=${bookId}&c=${chapter}`;
    if (verseStart) {
      url += `&vs=${verseStart}`;
      if (verseEnd && verseEnd !== verseStart) url += `&ve=${verseEnd}`;
    }
    return url;
  }

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      const shareUrl = buildShareUrl();

      if (shareUrl) {
        let message = verseRef;
        // 구절 본문 조회 (최대 4절)
        if (bookId && chapter && verseStart) {
          const end = verseEnd ?? verseStart;
          const maxEnd = Math.min(end, verseStart + 3);
          const verses = await getVerseRange(bookId, chapter, verseStart, maxEnd);
          if (verses.length > 0) {
            const text = verses.map(v => `${v.verse} ${v.text}`).join('\n');
            const hasMore = end > maxEnd;
            message += `\n\n${text}${hasMore ? '\n...' : ''}`;
          }
        }
        message += `\n\n${shareUrl}`;
        await Share.share({ message, url: uri });
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '묵상 공유' });
        }
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
  const qaEntries = parseQA(noteText);
  const isQA = qaEntries !== null;
  const displayNote = !isQA
    ? (noteText.length > 200 ? noteText.slice(0, 200) + '...' : noteText)
    : '';

  return (
    <View style={card.container}>
      {/* Logo + 구절 참조 */}
      <View style={card.header}>
        <View style={card.logoRow}>
          <MaterialCommunityIcons name="cross" size={14} color="rgba(212,168,71,0.45)" />
          <Text style={card.logoText}>MANNA</Text>
        </View>
        <Text style={card.ref}>{verseRef}</Text>
      </View>

      <View style={card.divider} />

      {/* Q&A 형식 */}
      {isQA ? (
        <View style={card.qaWrap}>
          {qaEntries.slice(0, 3).map((entry, i) => (
            <View key={i} style={card.qaEntry}>
              <View style={card.qaQRow}>
                <Text style={card.qaNum}>{i + 1}</Text>
                <Text style={card.qaQ}>{entry.q}</Text>
              </View>
              {entry.a ? (
                <Text style={card.qaA}>{entry.a}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        /* 일반 묵상 */
        <Text style={card.note}>{displayNote}</Text>
      )}

      {/* 푸터 — 단일 라인 */}
      <View style={card.footer}>
        <Text style={card.date}>{date}</Text>
        <Text style={card.footerDot}>{'\u00B7'}</Text>
        <Text style={card.tagline}>{isPro ? '만나' : '만나 앱에서 묵상하기'}</Text>
      </View>
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
    padding: 24,
  },
  // 헤더: 로고 + 구절 참조
  header: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  logoText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(212,168,71,0.45)',
    letterSpacing: 2.5,
  },
  ref: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D4A847',
    letterSpacing: 0.3,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(212,168,71,0.12)',
    marginBottom: 16,
  },
  // 일반 묵상
  note: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.9)',
  },
  // Q&A 묵상
  qaWrap: { gap: 14 },
  qaEntry: { gap: 6 },
  qaQRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  qaNum: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D4A847',
    width: 16,
    lineHeight: 20,
  },
  qaQ: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },
  qaA: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.9)',
    paddingLeft: 24,
  },
  // 푸터
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 6,
  },
  date: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
  },
  footerDot: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.15)',
  },
  tagline: {
    fontSize: 10,
    color: 'rgba(212,168,71,0.35)',
    letterSpacing: 0.3,
  },
});

import { useRef } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export interface PrayerShareItem {
  content: string;
  groupName?: string | null;
  date: string;
}

interface Props {
  items: PrayerShareItem[];
  cardRef: React.RefObject<ViewShot | null>;
}

export default function PrayerShareCard({ items, cardRef }: Props) {
  return (
    <ViewShot ref={cardRef as any} options={{ format: 'png', quality: 1 }} style={styles.captureWrap}>
      <CardDesign items={items} />
    </ViewShot>
  );
}

export async function capturePrayerCard(cardRef: React.RefObject<ViewShot | null>): Promise<void> {
  const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '기도제목 공유' });
  } else {
    await Share.share({ url: uri });
  }
}

function CardDesign({ items }: { items: PrayerShareItem[] }) {
  const displayItems = items.slice(0, 8);
  return (
    <View style={card.container}>
      <View style={card.header}>
        <View style={card.logoRow}>
          <MaterialCommunityIcons name="cross" size={14} color="rgba(212,168,71,0.45)" />
          <Text style={card.logoText}>MANNA</Text>
        </View>
        <Text style={card.title}>기도제목</Text>
      </View>

      <View style={card.divider} />

      <View style={card.itemsWrap}>
        {displayItems.map((item, i) => (
          <View key={i} style={[card.prayerItem, i < displayItems.length - 1 && card.prayerItemBorder]}>
            {item.groupName ? (
              <Text style={card.groupTag}>{item.groupName}</Text>
            ) : null}
            <View style={card.contentRow}>
              <Text style={card.num}>{i + 1}.</Text>
              <Text style={card.content}>{item.content}</Text>
            </View>
          </View>
        ))}
        {items.length > 8 ? (
          <Text style={card.moreText}>외 {items.length - 8}개 더...</Text>
        ) : null}
      </View>

      <View style={card.footer}>
        <Text style={card.date}>{displayItems[0]?.date ?? ''}</Text>
        {items.length > 1 ? <Text style={card.footerDot}>{'\u00B7'}</Text> : null}
        {items.length > 1 ? <Text style={card.itemCount}>{items.length}개</Text> : null}
        <Text style={card.footerDot}>{'\u00B7'}</Text>
        <Text style={card.tagline}>만나 앱에서 기도하기</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  captureWrap: {
    position: 'absolute',
    top: -9999,
    left: -9999,
    width: 360,
  },
});

const card = StyleSheet.create({
  container: {
    width: 360,
    backgroundColor: '#0B0A12',
    borderRadius: 20,
    overflow: 'hidden',
    padding: 24,
  },
  header: { alignItems: 'center', gap: 8, marginBottom: 16 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  logoText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(212,168,71,0.45)',
    letterSpacing: 2.5,
  },
  title: {
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
  itemsWrap: { gap: 0 },
  prayerItem: { paddingVertical: 10, gap: 3 },
  prayerItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  groupTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D4A847',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  contentRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
  },
  num: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D4A847',
    lineHeight: 21,
    minWidth: 18,
  },
  content: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.88)',
  },
  moreText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.30)',
    fontStyle: 'italic',
    paddingTop: 8,
  },
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
  date: { fontSize: 10, color: 'rgba(255,255,255,0.25)' },
  footerDot: { fontSize: 10, color: 'rgba(255,255,255,0.15)' },
  itemCount: { fontSize: 10, color: 'rgba(255,255,255,0.35)' },
  tagline: { fontSize: 10, color: 'rgba(212,168,71,0.35)', letterSpacing: 0.3 },
});

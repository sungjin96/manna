import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Colors {
  surface: string;
  border: string;
  gold: string;
  text: string;
  muted: string;
}

interface Props {
  verseLabel: string;
  isBookmarked: boolean;
  paddingBottom: number;
  colors: Colors;
  onMemo: () => void;
  onAI: () => void;
  onTTS: () => void;
  onCopy: () => void;
  onShare: () => void;
  onBookmark: () => void;
  onClose: () => void;
}

export default function VerseActionBar({
  verseLabel,
  isBookmarked,
  paddingBottom,
  colors,
  onMemo,
  onAI,
  onTTS,
  onCopy,
  onShare,
  onBookmark,
  onClose,
}: Props) {
  return (
    <View style={[styles.wrap, { bottom: paddingBottom + 8 }]}>
      {/* 구절 라벨 */}
      <Text style={styles.label} numberOfLines={1}>{verseLabel}</Text>

      {/* 글라스 pill */}
      <View style={styles.pill}>
        {/* 기록 — primary, gold tint */}
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.75 }]}
          onPress={onMemo}
        >
          <MaterialCommunityIcons name="notebook-edit-outline" size={16} color="#0B0A12" />
          <Text style={styles.primaryBtnText}>기록</Text>
        </Pressable>

        <View style={styles.divider} />

        {/* AI */}
        <IconBtn icon="robot-outline" color={colors.gold} onPress={onAI} />

        {/* TTS */}
        <IconBtn icon="play-circle-outline" color="rgba(255,255,255,0.7)" onPress={onTTS} />

        {/* 복사 */}
        <IconBtn icon="content-copy" color="rgba(255,255,255,0.7)" onPress={onCopy} />

        {/* 공유 */}
        <IconBtn icon="share-variant-outline" color="rgba(255,255,255,0.7)" onPress={onShare} />

        {/* 저장 */}
        <IconBtn
          icon={isBookmarked ? 'bookmark' : 'bookmark-outline'}
          color={isBookmarked ? colors.gold : 'rgba(255,255,255,0.7)'}
          onPress={onBookmark}
        />

        <View style={styles.divider} />

        {/* 닫기 */}
        <IconBtn icon="close" color="rgba(255,255,255,0.35)" onPress={onClose} />
      </View>
    </View>
  );
}

function IconBtn({ icon, color, onPress }: { icon: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
      onPress={onPress}
      hitSlop={4}
    >
      <MaterialCommunityIcons name={icon as any} size={20} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(10,8,20,0.94)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(212,168,71,0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#D4A847',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginLeft: 4,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0B0A12',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 4,
  },
  iconBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
});

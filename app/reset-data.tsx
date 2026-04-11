import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { resetData } from '../db/reset';
import MannaAlert from '../components/MannaAlert';

const ITEMS = [
  { icon: 'book-open-variant' as const, label: '읽기 기록', desc: '완료한 챕터, 절 단위 읽기 기록이 모두 삭제됩니다' },
  { icon: 'notebook-edit-outline' as const, label: '묵상 기록', desc: '직접 작성한 묵상 노트가 전부 삭제됩니다' },
  { icon: 'fire' as const, label: '스트릭 & 통계', desc: '연속 읽기, 최장 기록, 총 챕터 수가 0으로 돌아갑니다' },
  { icon: 'shield-star-outline' as const, label: '뱃지 진행률', desc: '획득한 뱃지가 초기화되고 처음부터 다시 시작합니다' },
  { icon: 'robot-outline' as const, label: 'AI 캐시', desc: 'AI 묵상 질문, 구절 해설, 기도문 캐시가 삭제됩니다' },
];

const KEPT = [
  { icon: 'cog-outline' as const, label: '설정 유지', desc: '알림, 테마, 폰트, 통독 계획 등 설정은 그대로 유지됩니다' },
  { icon: 'crown-outline' as const, label: '구독 유지', desc: '프리미엄 구독 상태는 영향을 받지 않습니다' },
];

export default function ResetDataScreen() {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [doneVisible, setDoneVisible] = useState(false);

  async function executeReset() {
    setConfirmVisible(false);
    setResetting(true);
    await resetData();
    setResetting(false);
    setDoneVisible(true);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} />
        </Pressable>
        <Text style={styles.headerTitle}>데이터 초기화</Text>
      </View>

      {/* Warning banner */}
      <View style={styles.warningBanner}>
        <MaterialCommunityIcons name="alert-outline" size={22} color="#FF4444" />
        <Text style={styles.warningText}>
          이 작업은 되돌릴 수 없습니다
        </Text>
      </View>

      <Text style={styles.description}>
        아래 데이터가 영구적으로 삭제됩니다.{'\n'}
        초기화 전에 데이터 내보내기로 백업하는 것을 권장합니다.
      </Text>

      {/* Deleted items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>삭제되는 데이터</Text>
        {ITEMS.map((item) => (
          <View key={item.label} style={styles.item}>
            <View style={styles.iconBoxDanger}>
              <MaterialCommunityIcons name={item.icon} size={16} color="#FF4444" />
            </View>
            <View style={styles.itemText}>
              <Text style={styles.itemLabel}>{item.label}</Text>
              <Text style={styles.itemDesc}>{item.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Kept items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitleSafe}>유지되는 항목</Text>
        {KEPT.map((item) => (
          <View key={item.label} style={styles.item}>
            <View style={styles.iconBoxSafe}>
              <MaterialCommunityIcons name={item.icon} size={16} color="#4CAF50" />
            </View>
            <View style={styles.itemText}>
              <Text style={styles.itemLabel}>{item.label}</Text>
              <Text style={styles.itemDesc}>{item.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Reset button */}
      <Pressable
        style={({ pressed }) => [styles.resetBtn, pressed && { opacity: 0.85 }]}
        onPress={() => setConfirmVisible(true)}
        disabled={resetting}
      >
        <MaterialCommunityIcons name="delete-alert-outline" size={18} color="#FFFFFF" />
        <Text style={styles.resetBtnText}>
          {resetting ? '초기화 중...' : '모든 데이터 초기화'}
        </Text>
      </Pressable>

      <Text style={styles.footerWarning}>
        초기화 후에도 앱을 계속 사용할 수 있습니다.{'\n'}
        처음 설치한 상태로 돌아갑니다.
      </Text>

      <MannaAlert
        visible={confirmVisible}
        title="정말 초기화하시겠습니까?"
        message="위에 나열된 모든 데이터가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
        buttons={[
          { text: '취소', style: 'cancel' },
          { text: '초기화', style: 'destructive', onPress: executeReset },
        ]}
        onDismiss={() => setConfirmVisible(false)}
      />

      <MannaAlert
        visible={doneVisible}
        title="초기화 완료"
        message="모든 데이터가 초기화되었습니다."
        buttons={[
          { text: '확인', style: 'default', onPress: () => router.back() },
        ]}
        onDismiss={() => { setDoneVisible(false); router.back(); }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { paddingBottom: 60 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
  },
  backBtn: { marginRight: 4 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: theme.text },

  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.25)',
    borderRadius: 12,
  },
  warningText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF4444',
    flex: 1,
  },

  description: {
    fontSize: 13,
    color: theme.textSub,
    lineHeight: 20,
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },

  section: {
    marginTop: 20,
    marginHorizontal: 20,
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF4444',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitleSafe: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4CAF50',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },

  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
  iconBoxDanger: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,68,68,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  iconBoxSafe: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(76,175,80,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  itemText: { flex: 1, gap: 2 },
  itemLabel: { fontSize: 14, fontWeight: '600', color: theme.text },
  itemDesc: { fontSize: 12, color: theme.textMuted, lineHeight: 18 },

  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 28,
    paddingVertical: 16,
    backgroundColor: '#CC2222',
    borderRadius: 14,
  },
  resetBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  footerWarning: {
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 16,
    paddingHorizontal: 20,
  },
});

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getSetting, setSetting } from '../../db/settings';
import { theme } from '../../constants/theme';
import { UI_SCALE_OPTIONS, UIScaleValue, useUIScale } from '../../contexts/UIScaleContext';
import { exportToJSON, importFromJSON, backupErrorMessage } from '../../utils/backup';
import { checkAIEntitlement, purchasePremium, restorePurchases, purchaseErrorMessage } from '../../utils/subscriptions';
import { requestNotificationPermission, scheduleReadingReminder, cancelReadingReminder } from '../../utils/notifications';
import { READING_PLANS, PlanId } from '../../constants/reading-plans';
import { getActivePlan, setActivePlan, clearActivePlan, todayISO } from '../../db/reading_plans';
import { resetSettings } from '../../db/reset';
import MannaAlert from '../../components/MannaAlert';

export default function SettingsScreen() {
  const router = useRouter();
  const { scale: uiScale, setScale: setUiScale, fs, is } = useUIScale();
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifHour, setNotifHour] = useState(8);
  const [notifMinute, setNotifMinute] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isPremiumLoading, setIsPremiumLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [activePlanId, setActivePlanId] = useState<PlanId | null>(null);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [updateStatus, setUpdateStatus] = useState<'checking' | 'latest' | 'available' | 'downloading' | 'restarting' | 'error'>('checking');
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);
  const [resetDoneVisible, setResetDoneVisible] = useState(false);
  useEffect(() => {
    (async () => {
      const enabled = await getSetting('notification_enabled', '0');
      const hour = parseInt(await getSetting('notification_hour', '8'), 10);
      const minute = parseInt(await getSetting('notification_minute', '0'), 10);
      const plan = await getActivePlan();
      const autoUpd = await getSetting('auto_update', '1');
      setNotifEnabled(enabled === '1');
      setNotifHour(hour);
      setNotifMinute(minute);
      setActivePlanId((plan?.planId as PlanId) ?? null);
      setAutoUpdate(autoUpd === '1');
      const premium = await checkAIEntitlement();
      setIsPremium(premium);
      setIsPremiumLoading(false);

      // Check for OTA update
      checkForOTAUpdate();
    })();
  }, []);

  async function checkForOTAUpdate() {
    try {
      if (__DEV__) { setUpdateStatus('latest'); return; }
      const { isAvailable } = await Updates.checkForUpdateAsync();
      setUpdateStatus(isAvailable ? 'available' : 'latest');
    } catch {
      setUpdateStatus('latest');
    }
  }

  async function handleOTAUpdate() {
    try {
      setUpdateStatus('downloading');
      await Updates.fetchUpdateAsync();
      setUpdateStatus('restarting');
      await Updates.reloadAsync();
    } catch {
      setUpdateStatus('error');
      setTimeout(() => setUpdateStatus('available'), 2500);
    }
  }

  async function toggleAutoUpdate(val: boolean) {
    setAutoUpdate(val);
    await setSetting('auto_update', val ? '1' : '0');
  }

  async function selectPlan(planId: PlanId | null) {
    if (planId === null) {
      await clearActivePlan();
      setActivePlanId(null);
    } else {
      await setActivePlan(planId, todayISO());
      setActivePlanId(planId);
    }
  }

  async function toggleNotification(value: boolean) {
    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert('알림 권한 필요', '설정 앱에서 알림 권한을 허용해주세요.');
        return;
      }
      await scheduleReadingReminder(notifHour, notifMinute);
    } else {
      await cancelReadingReminder();
    }
    setNotifEnabled(value);
    await setSetting('notification_enabled', value ? '1' : '0');
  }

  async function changeHour(delta: number) {
    const next = (notifHour + delta + 24) % 24;
    setNotifHour(next);
    await setSetting('notification_hour', String(next));
    if (notifEnabled) await scheduleReadingReminder(next, notifMinute);
  }

  async function changeMinute(delta: number) {
    const next = (notifMinute + delta + 60) % 60;
    setNotifMinute(next);
    await setSetting('notification_minute', String(next));
    if (notifEnabled) await scheduleReadingReminder(notifHour, next);
  }

  async function handleExport() {
    setExporting(true);
    const { error } = await exportToJSON();
    setExporting(false);
    if (error && error !== 'pick_cancelled') {
      Alert.alert('내보내기 실패', backupErrorMessage(error));
    }
  }

  async function handleImport() {
    Alert.alert(
      '데이터 가져오기',
      '기존 데이터가 모두 삭제되고 백업 파일로 덮어씁니다. 계속하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '가져오기',
          style: 'destructive',
          onPress: async () => {
            setImporting(true);
            const { data, error } = await importFromJSON();
            setImporting(false);
            if (error) {
              if (error !== 'pick_cancelled') {
                Alert.alert('가져오기 실패', backupErrorMessage(error));
              }
            } else {
              Alert.alert('가져오기 완료', data?.counts ?? '복원 완료');
            }
          },
        },
      ]
    );
  }

  async function handlePurchase() {
    setPurchasing(true);
    const { success, error } = await purchasePremium();
    setPurchasing(false);
    if (success) {
      setIsPremium(true);
      Alert.alert('구독 완료', 'AI 묵상 기능을 사용할 수 있습니다!');
    } else if (error && error !== 'cancelled') {
      Alert.alert('구독 실패', purchaseErrorMessage(error));
    }
  }

  async function handleRestorePurchases() {
    setPurchasing(true);
    const restored = await restorePurchases();
    setPurchasing(false);
    if (restored) {
      setIsPremium(true);
      Alert.alert('복원 완료', '구독이 복원되었습니다.');
    } else {
      Alert.alert('복원 실패', '복원할 구독을 찾을 수 없습니다.');
    }
  }

  const pad = (n: number) => String(n).padStart(2, '0');

  // 버전 표시: OTA 배포일이 있으면 "1.0.0 · 04-11", 없으면 "1.0.0 (Build 21)"
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber ?? '';
  const otaDate = Updates.createdAt
    ? (() => {
        const d = Updates.createdAt!;
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${mm}-${dd}`;
      })()
    : null;
  const version = otaDate
    ? `${appVersion} · ${otaDate}`
    : buildNumber
    ? `${appVersion} (Build ${buildNumber})`
    : appVersion;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { fontSize: fs(24) }]}>설정</Text>
      </View>

      {/* 구독 섹션 */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { fontSize: fs(11) }]}>구독</Text>

        {isPremiumLoading ? (
          <View style={[styles.subsCard, { alignItems: 'center', paddingVertical: 24 }]}>
            <ActivityIndicator color={theme.gold} />
          </View>
        ) : isPremium ? (
          /* ── Pro 구독 중 ── */
          <View style={styles.subsCard}>
            {/* Pro badge row */}
            <View style={styles.subsActiveHeader}>
              <View style={styles.subsActiveBadge}>
                <MaterialCommunityIcons name="crown" size={15} color={theme.bg} />
                <Text style={styles.subsActiveBadgeText}>Manna Pro</Text>
              </View>
              <MaterialCommunityIcons name="check-circle" size={18} color={theme.gold} />
            </View>
            <Text style={[styles.subsActiveDesc, { color: theme.textMuted }]}>
              모든 Pro 기능을 이용 중입니다.
            </Text>
            {/* 구독 관리 (취소) — App Store로 이동 */}
            <Pressable
              style={({ pressed }) => [styles.subsManageBtn, pressed && { opacity: 0.7 }]}
              onPress={() => Linking.openURL('itms-apps://apps.apple.com/account/subscriptions')}
            >
              <Text style={[styles.subsManageBtnText, { color: theme.textSub }]}>구독 관리 / 취소</Text>
              <MaterialCommunityIcons name="open-in-new" size={13} color={theme.textMuted} />
            </Pressable>
          </View>
        ) : (
          /* ── 미구독 — 업셀 카드 ── */
          <View style={styles.subsCard}>
            {/* 가격 히어로 */}
            <View style={styles.subsPriceHero}>
              <MaterialCommunityIcons name="crown-outline" size={28} color={theme.gold} />
              <Text style={styles.subsPriceTitle}>Manna Pro</Text>
              <View style={styles.subsPriceRow}>
                <Text style={styles.subsPriceStrike}>₩6,600</Text>
                <Text style={styles.subsPriceCurrent}>₩3,300</Text>
                <Text style={styles.subsPriceUnit}>/월</Text>
              </View>
              <View style={styles.subsDiscountChip}>
                <MaterialCommunityIcons name="lightning-bolt" size={11} color={theme.gold} />
                <Text style={styles.subsDiscountChipText}>출시 기념 50% 할인</Text>
              </View>
            </View>

            {/* 기능 그리드 (2열) */}
            <View style={styles.subsGrid}>
              {([
                { icon: 'headphones',              label: 'TTS 낭독' },
                { icon: 'brain',                   label: 'AI 묵상 30회/일' },
                { icon: 'book-open-page-variant',  label: '구절 해설 30회/일' },
                { icon: 'hands-pray',              label: '기도문 30회/일' },
                { icon: 'compass-rose',            label: '테마 구절 추천' },
                { icon: 'calendar-month',          label: 'Streak 히트맵' },
              ] as const).map((f) => (
                <View key={f.label} style={styles.subsGridItem}>
                  <View style={styles.subsGridIcon}>
                    <MaterialCommunityIcons name={f.icon} size={15} color={theme.gold} />
                  </View>
                  <Text style={styles.subsGridLabel}>{f.label}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            <Pressable
              style={({ pressed }) => [styles.subsCTA, pressed && { opacity: 0.85 }]}
              onPress={handlePurchase}
              disabled={purchasing}
            >
              {purchasing ? (
                <ActivityIndicator color={theme.bg} size="small" />
              ) : (
                <Text style={styles.subsCTAText}>지금 시작하기</Text>
              )}
            </Pressable>

            {/* Footer links */}
            <View style={styles.subsFooter}>
              <Text style={styles.subsFooterText}>언제든 취소 가능</Text>
              <Text style={styles.subsFooterText}> · </Text>
              <Pressable onPress={handleRestorePurchases} disabled={purchasing} hitSlop={12}>
                <Text style={[styles.subsFooterText, { color: theme.textSub }]}>구독 복원</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* 텍스트 크기 섹션 */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { fontSize: fs(11) }]}>텍스트 크기</Text>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="format-size" size={is(20)} color={theme.gold} />
            <Text style={[styles.rowLabel, { fontSize: fs(15) }]}>화면 텍스트 크기</Text>
          </View>
        </View>
        <View style={scalePickerStyles.row}>
          {UI_SCALE_OPTIONS.map((opt) => {
            const active = uiScale === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[scalePickerStyles.chip, active && scalePickerStyles.chipActive]}
                onPress={() => setUiScale(opt.value as UIScaleValue)}
                hitSlop={8}
              >
                <Text style={[
                  scalePickerStyles.chipLabel,
                  active && scalePickerStyles.chipLabelActive,
                  { fontSize: opt.value * 11 },
                ]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.rowHint, { paddingHorizontal: 20, paddingBottom: 14 }]}>
          홈, 탭바, 설정 등 앱 전체 UI에 적용됩니다. 읽기 화면 본문은 별도 설정을 따릅니다.
        </Text>
      </View>

      {/* 알림 섹션 */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { fontSize: fs(11) }]}>알림</Text>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="bell-outline" size={is(20)} color={theme.gold} />
            <Text style={[styles.rowLabel, { fontSize: fs(15) }]}>매일 읽기 알림</Text>
          </View>
          <Switch
            value={notifEnabled}
            onValueChange={toggleNotification}
            trackColor={{ false: theme.borderSubtle, true: theme.gold }}
            thumbColor={theme.bg}
          />
        </View>

        {notifEnabled && (
          <View style={styles.timePicker}>
            {/* 프리셋 시간대 */}
            <View style={styles.presetRow}>
              {([
                { label: '새벽', hour: 5, minute: 0 },
                { label: '아침', hour: 7, minute: 0 },
                { label: '점심', hour: 12, minute: 0 },
                { label: '저녁', hour: 21, minute: 0 },
              ] as const).map(p => {
                const active = notifHour === p.hour && notifMinute === p.minute;
                return (
                  <Pressable
                    key={p.label}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                    onPress={async () => {
                      setNotifHour(p.hour);
                      setNotifMinute(p.minute);
                      await setSetting('notification_hour', String(p.hour));
                      await setSetting('notification_minute', String(p.minute));
                      await scheduleReadingReminder(p.hour, p.minute);
                    }}
                  >
                    <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>
                      {p.label}
                    </Text>
                    <Text style={[styles.presetTime, active && styles.presetTimeActive]}>
                      {pad(p.hour)}:{pad(p.minute)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 직접 설정 — 가운데 정렬 */}
            <Text style={styles.timePickerLabel}>직접 설정</Text>
            <View style={styles.timeRow}>
              <View style={styles.timeUnit}>
                <Pressable style={styles.timeBtn} onPress={() => changeHour(1)} hitSlop={8}>
                  <MaterialCommunityIcons name="chevron-up" size={20} color={theme.gold} />
                </Pressable>
                <Text style={styles.timeValue}>{pad(notifHour)}</Text>
                <Pressable style={styles.timeBtn} onPress={() => changeHour(-1)} hitSlop={8}>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={theme.gold} />
                </Pressable>
              </View>
              <Text style={styles.timeSep}>:</Text>
              <View style={styles.timeUnit}>
                <Pressable style={styles.timeBtn} onPress={() => changeMinute(5)} hitSlop={8}>
                  <MaterialCommunityIcons name="chevron-up" size={20} color={theme.gold} />
                </Pressable>
                <Text style={styles.timeValue}>{pad(notifMinute)}</Text>
                <Pressable style={styles.timeBtn} onPress={() => changeMinute(-5)} hitSlop={8}>
                  <MaterialCommunityIcons name="chevron-down" size={20} color={theme.gold} />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* 통독 계획 섹션 */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { fontSize: fs(11) }]}>통독 계획</Text>

        {/* No plan option */}
        <Pressable
          style={({ pressed }) => [styles.row, styles.planRow, pressed && styles.rowPressed]}
          onPress={() => selectPlan(null)}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowLabel}>계획 없음</Text>
            <Text style={styles.rowHint}>자유롭게 읽기</Text>
          </View>
          {activePlanId === null && (
            <MaterialCommunityIcons name="check-circle" size={20} color={theme.gold} />
          )}
        </Pressable>

        {READING_PLANS.map(plan => (
          <Pressable
            key={plan.id}
            style={({ pressed }) => [styles.row, styles.planRow, pressed && styles.rowPressed]}
            onPress={() => selectPlan(plan.id as PlanId)}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.rowLabel}>{plan.name}</Text>
              <Text style={styles.rowHint}>{plan.description} · 하루 {plan.chaptersPerDay}챕터</Text>
            </View>
            {activePlanId === plan.id && (
              <MaterialCommunityIcons name="check-circle" size={20} color={theme.gold} />
            )}
          </Pressable>
        ))}
      </View>

      {/* 데이터 섹션 */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { fontSize: fs(11) }]}>데이터</Text>

        <Pressable
          style={({ pressed }) => [styles.row, styles.rowPressable, pressed && styles.rowPressed]}
          onPress={handleExport}
          disabled={exporting || importing}
        >
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="export-variant" size={20} color={theme.gold} />
            <View style={{ gap: 2 }}>
              <Text style={styles.rowLabel}>{exporting ? '내보내는 중...' : '데이터 내보내기'}</Text>
              <Text style={styles.rowHint}>전체 백업 파일 저장</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textMuted} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.row, styles.rowPressable, pressed && styles.rowPressed]}
          onPress={handleImport}
          disabled={exporting || importing}
        >
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="import" size={20} color={theme.gold} />
            <View style={{ gap: 2 }}>
              <Text style={styles.rowLabel}>{importing ? '가져오는 중...' : '데이터 가져오기'}</Text>
              <Text style={styles.rowHint}>백업 파일에서 복원</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textMuted} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.row, styles.rowPressable, pressed && styles.rowPressed]}
          onPress={() => setResetConfirmVisible(true)}
        >
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="restart" size={20} color={theme.textSub} />
            <View style={{ gap: 2 }}>
              <Text style={styles.rowLabel}>설정 초기화</Text>
              <Text style={styles.rowHint}>모든 설정을 기본값으로 복원</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textMuted} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.row, styles.rowPressable, pressed && styles.rowPressed]}
          onPress={() => router.push('/reset-data')}
        >
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="delete-alert-outline" size={20} color="#FF4444" />
            <View style={{ gap: 2 }}>
              <Text style={[styles.rowLabel, { color: '#FF4444' }]}>데이터 초기화</Text>
              <Text style={styles.rowHint}>읽기 기록, 묵상, 뱃지 등 모든 데이터 삭제</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textMuted} />
        </Pressable>
      </View>

      {/* 앱 정보 섹션 */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { fontSize: fs(11) }]}>앱 정보</Text>

        {/* 버전 + 업데이트 상태 */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>버전</Text>
          <View style={styles.versionRight}>
            <Text style={styles.rowValue}>{version}</Text>
            {updateStatus === 'checking' && (
              <ActivityIndicator size={11} color={theme.textMuted} style={{ marginLeft: 6 }} />
            )}
            {updateStatus === 'latest' && (
              <View style={styles.badgeLatest}>
                <Text style={styles.badgeLatestText}>최신</Text>
              </View>
            )}
            {(updateStatus === 'available' || updateStatus === 'error') && (
              <Pressable
                style={({ pressed }) => [styles.updateBtn, pressed && { opacity: 0.75 }]}
                onPress={handleOTAUpdate}
              >
                <MaterialCommunityIcons name="arrow-down-circle-outline" size={13} color={theme.bg} />
                <Text style={styles.updateBtnText}>
                  {updateStatus === 'error' ? '다시 시도' : '업데이트'}
                </Text>
              </Pressable>
            )}
            {updateStatus === 'downloading' && (
              <View style={styles.downloadingBadge}>
                <ActivityIndicator size={11} color={theme.gold} />
                <Text style={styles.downloadingText}>다운로드 중</Text>
              </View>
            )}
            {updateStatus === 'restarting' && (
              <View style={styles.downloadingBadge}>
                <ActivityIndicator size={11} color={theme.gold} />
                <Text style={styles.downloadingText}>적용 중...</Text>
              </View>
            )}
          </View>
        </View>

        {/* 자동 업데이트 */}
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowLabel}>자동 업데이트</Text>
            <Text style={styles.rowHint}>앱 실행 시 업데이트 자동 설치</Text>
          </View>
          <Switch
            value={autoUpdate}
            onValueChange={toggleAutoUpdate}
            trackColor={{ false: theme.borderSubtle, true: `${theme.gold}80` }}
            thumbColor={autoUpdate ? theme.gold : theme.textMuted}
          />
        </View>

        <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
          <Text style={styles.rowLabel}>성경 본문</Text>
          <Text style={styles.rowHint}>
            개역성경 (한국성서공회, Public Domain){'\n'}
            Korean Revised Version — 무료 사용 허가
          </Text>
        </View>
      </View>

      <MannaAlert
        visible={resetConfirmVisible}
        title="설정 초기화"
        message="알림, 테마, 폰트, 통독 계획 등 모든 설정이 기본값으로 돌아갑니다. 읽기 기록과 묵상은 유지됩니다."
        buttons={[
          { text: '취소', style: 'cancel' },
          {
            text: '초기화',
            style: 'destructive',
            onPress: async () => {
              await resetSettings();
              setResetConfirmVisible(false);
              setResetDoneVisible(true);
            },
          },
        ]}
        onDismiss={() => setResetConfirmVisible(false)}
      />

      <MannaAlert
        visible={resetDoneVisible}
        title="설정 초기화 완료"
        message="앱을 다시 시작하면 기본 설정이 적용됩니다."
        buttons={[{ text: '확인', style: 'default' }]}
        onDismiss={() => setResetDoneVisible(false)}
      />
    </ScrollView>
  );
}

const scalePickerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    backgroundColor: 'transparent',
  },
  chipActive: {
    borderColor: theme.gold,
    backgroundColor: 'rgba(212,168,71,0.1)',
  },
  chipLabel: {
    fontWeight: '600',
    color: theme.textMuted,
  },
  chipLabelActive: {
    color: theme.gold,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { paddingBottom: 40 },

  header: {
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },

  section: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderSubtle,
    backgroundColor: theme.surface,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
  rowPressable: {},
  rowPressed: { backgroundColor: theme.surface2 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowLabel: { fontSize: 15, color: theme.text },
  rowValue: { fontSize: 14, color: theme.textMuted },
  rowHint: { fontSize: 12, color: theme.textMuted, lineHeight: 18 },

  timePicker: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
    gap: 12,
  },
  presetRow: {
    flexDirection: 'row', gap: 8, marginBottom: 16,
  },
  presetChip: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderColor: theme.borderSubtle,
    gap: 2,
  },
  presetChipActive: {
    borderColor: theme.gold, backgroundColor: 'rgba(212,168,71,0.1)',
  },
  presetLabel: { fontSize: 11, color: theme.textMuted },
  presetLabelActive: { color: theme.gold },
  presetTime: { fontSize: 13, fontWeight: '600', color: theme.textSub },
  presetTimeActive: { color: theme.gold },
  timePickerLabel: { fontSize: 13, color: theme.textMuted, textAlign: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  timeUnit: { alignItems: 'center', gap: 4 },
  timeBtn: { padding: 4 },
  timeValue: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.gold,
    width: 56,
    textAlign: 'center',
    letterSpacing: 1,
  },
  timeSep: { fontSize: 28, fontWeight: '700', color: theme.gold, marginBottom: 4 },


  planRow: {
    gap: 4,
  },

  // Subscription card
  // ── 구독 카드 (공통 컨테이너) ─────────────────────────────────────────────
  subsCard: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },

  // ── 구독 중 상태 ──────────────────────────────────────────────────────────
  subsActiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subsActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  subsActiveBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.bg,
    letterSpacing: 0.2,
  },
  subsActiveDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: -4,
  },
  subsManageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    marginBottom: 4,
  },
  subsManageBtnText: {
    fontSize: 12,
  },

  // ── 미구독 — 가격 히어로 ──────────────────────────────────────────────────
  subsPriceHero: {
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
    paddingBottom: 4,
  },
  subsPriceTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.text,
    letterSpacing: 0.3,
  },
  subsPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 2,
  },
  subsPriceStrike: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.textMuted,
    textDecorationLine: 'line-through',
  },
  subsPriceCurrent: {
    fontSize: 32,
    fontWeight: '900',
    color: theme.gold,
    letterSpacing: -0.5,
  },
  subsPriceUnit: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.textMuted,
  },
  subsDiscountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${theme.gold}18`,
    borderWidth: 1,
    borderColor: `${theme.gold}40`,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 2,
  },
  subsDiscountChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.gold,
    letterSpacing: 0.2,
  },

  // ── 기능 2열 그리드 ──────────────────────────────────────────────────────
  subsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subsGridItem: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.goldBg,
    borderWidth: 1,
    borderColor: theme.goldBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  subsGridIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: `${theme.gold}22`,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  subsGridLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.text,
    flex: 1,
  },

  // ── CTA 버튼 ─────────────────────────────────────────────────────────────
  subsCTA: {
    backgroundColor: theme.gold,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  subsCTAText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.bg,
    letterSpacing: 0.3,
  },

  // ── Footer ───────────────────────────────────────────────────────────────
  subsFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 8,
    gap: 0,
  },
  subsFooterText: {
    fontSize: 11,
    color: theme.textMuted,
  },

  // Version & update styles
  versionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeLatest: {
    backgroundColor: 'rgba(100,200,100,0.15)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(100,200,100,0.30)',
  },
  badgeLatestText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6EC97A',
    letterSpacing: 0.4,
  },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.gold,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  updateBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.bg,
  },
  downloadingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  downloadingText: {
    fontSize: 11,
    color: theme.gold,
  },

});

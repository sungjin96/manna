import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getSetting, setSetting } from '../../db/settings';
import { theme } from '../../constants/theme';
import { exportToJSON, importFromJSON, backupErrorMessage } from '../../utils/backup';
import { checkAIEntitlement, purchasePremium, restorePurchases, purchaseErrorMessage } from '../../utils/subscriptions';
import { useReaderSettings, READER_THEMES, ReaderTheme } from '../../hooks/useReaderSettings';
import { scheduleReadingReminder, cancelReadingReminder } from '../../utils/notifications';
import { READING_PLANS, PlanId } from '../../constants/reading-plans';
import { getActivePlan, setActivePlan, clearActivePlan, todayISO } from '../../db/reading_plans';

export default function SettingsScreen() {
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifHour, setNotifHour] = useState(8);
  const [notifMinute, setNotifMinute] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isPremiumLoading, setIsPremiumLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [meditationPromptEnabled, setMeditationPromptEnabled] = useState(true);
  const [activePlanId, setActivePlanId] = useState<PlanId | null>(null);
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  const { settings, update: updateReader } = useReaderSettings();

  useEffect(() => {
    (async () => {
      const enabled = await getSetting('notification_enabled', '0');
      const hour = parseInt(await getSetting('notification_hour', '8'), 10);
      const minute = parseInt(await getSetting('notification_minute', '0'), 10);
      const meditPrompt = await getSetting('meditation_prompt_enabled', '1');
      const plan = await getActivePlan();
      setNotifEnabled(enabled === '1');
      setNotifHour(hour);
      setNotifMinute(minute);
      setMeditationPromptEnabled(meditPrompt === '1');
      setActivePlanId((plan?.planId as PlanId) ?? null);
      const apiKey = await getSetting('claude_api_key', '');
      setClaudeApiKey(apiKey);
      const premium = await checkAIEntitlement();
      setIsPremium(premium);
      setIsPremiumLoading(false);
    })();
  }, []);

  async function saveClaudeApiKey(key: string) {
    setClaudeApiKey(key);
    await setSetting('claude_api_key', key.trim());
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

  async function toggleMeditationPrompt(val: boolean) {
    setMeditationPromptEnabled(val);
    await setSetting('meditation_prompt_enabled', val ? '1' : '0');
  }

  async function toggleNotification(value: boolean) {
    if (value) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
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
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>설정</Text>
      </View>

      {/* 독서 설정 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>독서 설정</Text>

        {/* Theme */}
        <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 12 }]}>
          <Text style={styles.rowLabel}>화면 테마</Text>
          <View style={styles.themeRow}>
            {(['dark', 'sepia', 'light'] as ReaderTheme[]).map(t => {
              const tc = READER_THEMES[t];
              return (
                <Pressable
                  key={t}
                  style={[
                    styles.themeSwatch,
                    { backgroundColor: tc.bg, borderColor: settings.theme === t ? tc.gold : tc.border },
                    settings.theme === t && { borderWidth: 2 },
                  ]}
                  onPress={() => updateReader({ theme: t })}
                >
                  <Text style={[styles.themeSwatchLabel, { color: tc.text }]}>
                    {t === 'dark' ? '다크' : t === 'sepia' ? '세피아' : '라이트'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Font size */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>글자 크기</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => updateReader({ fontSize: Math.max(14, settings.fontSize - 1) })}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="minus" size={16} color={theme.gold} />
            </Pressable>
            <Text style={styles.stepValue}>{settings.fontSize}</Text>
            <Pressable
              style={styles.stepBtn}
              onPress={() => updateReader({ fontSize: Math.min(22, settings.fontSize + 1) })}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="plus" size={16} color={theme.gold} />
            </Pressable>
          </View>
        </View>

        {/* Line height */}
        <View style={styles.row}>
          <Text style={styles.rowLabel}>줄 간격</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => updateReader({ lineHeight: Math.max(1.4, Math.round((settings.lineHeight - 0.1) * 10) / 10) })}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="minus" size={16} color={theme.gold} />
            </Pressable>
            <Text style={styles.stepValue}>{settings.lineHeight.toFixed(1)}</Text>
            <Pressable
              style={styles.stepBtn}
              onPress={() => updateReader({ lineHeight: Math.min(2.0, Math.round((settings.lineHeight + 0.1) * 10) / 10) })}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="plus" size={16} color={theme.gold} />
            </Pressable>
          </View>
        </View>

        {/* Font */}
        <View style={[styles.row, { gap: 12 }]}>
          <Text style={styles.rowLabel}>폰트</Text>
          <View style={styles.fontRow}>
            {(['default', 'serif'] as const).map(f => (
              <Pressable
                key={f}
                style={[
                  styles.fontBtn,
                  settings.font === f && { backgroundColor: `${theme.gold}20`, borderColor: theme.gold },
                ]}
                onPress={() => updateReader({ font: f })}
              >
                <Text style={[
                  styles.fontBtnText,
                  { color: settings.font === f ? theme.gold : theme.textMuted },
                  f === 'serif' && { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
                ]}>
                  {f === 'default' ? '기본체' : '세리프체'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Meditation prompt toggle */}
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.rowLabel}>읽기 완료 후 묵상 입력</Text>
            <Text style={styles.rowHint}>끄면 완료 즉시 다음 챕터로 이동</Text>
          </View>
          <Switch
            value={meditationPromptEnabled}
            onValueChange={toggleMeditationPrompt}
            trackColor={{ false: theme.borderSubtle, true: `${theme.gold}80` }}
            thumbColor={meditationPromptEnabled ? theme.gold : theme.textMuted}
          />
        </View>
      </View>

      {/* 알림 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>알림</Text>

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="bell-outline" size={20} color={theme.gold} />
            <Text style={styles.rowLabel}>매일 읽기 알림</Text>
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
            <Text style={styles.timePickerLabel}>알림 시간</Text>
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

      {/* AI 묵상 도우미 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI 묵상 도우미</Text>

        <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 10 }]}>
          <View style={{ gap: 2 }}>
            <Text style={styles.rowLabel}>Claude API Key</Text>
            <Text style={styles.rowHint}>성경 구절 선택 후 AI 묵상 질문 생성에 사용됩니다.</Text>
          </View>
          <View style={styles.apiKeyRow}>
            <TextInput
              style={styles.apiKeyInput}
              value={claudeApiKey}
              onChangeText={saveClaudeApiKey}
              placeholder="sk-ant-..."
              placeholderTextColor={theme.textMuted}
              secureTextEntry={!apiKeyVisible}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Claude API 키 입력"
            />
            <Pressable onPress={() => setApiKeyVisible(v => !v)} hitSlop={8} style={styles.apiKeyEye}>
              <MaterialCommunityIcons
                name={apiKeyVisible ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={theme.textMuted}
              />
            </Pressable>
          </View>
          {claudeApiKey.length > 0 && (
            <Text style={styles.apiKeyStatus}>
              {claudeApiKey.startsWith('sk-ant-') ? '✓ 유효한 형식' : '⚠ sk-ant- 로 시작해야 합니다'}
            </Text>
          )}
        </View>
      </View>

      {/* 구독 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>구독</Text>

        {isPremiumLoading ? (
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.textMuted }]}>확인 중...</Text>
          </View>
        ) : isPremium ? (
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <MaterialCommunityIcons name="crown" size={20} color={theme.gold} />
              <Text style={styles.rowLabel}>프리미엄 구독 중</Text>
            </View>
            <MaterialCommunityIcons name="check-circle" size={18} color={theme.gold} />
          </View>
        ) : (
          <View style={styles.subsCard}>
            {/* Header: title + price pill */}
            <View style={styles.subsCardHeader}>
              <View style={styles.rowLeft}>
                <MaterialCommunityIcons name="crown-outline" size={20} color={theme.gold} />
                <Text style={styles.rowLabel}>프리미엄 구독</Text>
              </View>
              <View style={styles.pricePill}>
                <Text style={styles.pricePillText}>₩4,900/월</Text>
              </View>
            </View>

            {/* Features */}
            <View style={styles.subsFeatures}>
              <View style={styles.subsFeatureRow}>
                <MaterialCommunityIcons name="check" size={14} color={theme.gold} />
                <Text style={styles.subsFeatureText}>AI 묵상 질문 3개/선택</Text>
              </View>
              <View style={styles.subsFeatureRow}>
                <MaterialCommunityIcons name="check" size={14} color={theme.gold} />
                <Text style={styles.subsFeatureText}>광고 없음</Text>
              </View>
            </View>

            {/* CTA */}
            <Pressable
              style={({ pressed }) => [styles.subsCTA, pressed && { opacity: 0.85 }]}
              onPress={handlePurchase}
              disabled={purchasing}
            >
              <Text style={styles.subsCTAText}>{purchasing ? '처리 중...' : '구독 시작하기'}</Text>
            </Pressable>

            {/* Footer */}
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

      {/* 통독 계획 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>통독 계획</Text>

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
        <Text style={styles.sectionTitle}>데이터</Text>

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
      </View>

      {/* 앱 정보 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>앱 정보</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>버전</Text>
          <Text style={styles.rowValue}>{version}</Text>
        </View>

        <View style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 6 }]}>
          <Text style={styles.rowLabel}>성경 본문</Text>
          <Text style={styles.rowHint}>
            개역성경 (한국성서공회, Public Domain){'\n'}
            Korean Revised Version — 무료 사용 허가
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

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
  timePickerLabel: { fontSize: 13, color: theme.textMuted },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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

  // Reader settings
  themeRow: { flexDirection: 'row', gap: 8, width: '100%' },
  themeSwatch: {
    flex: 1, height: 52, borderRadius: 10,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  themeSwatchLabel: { fontSize: 12, fontWeight: '700' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 32, height: 32, borderRadius: 8,
    borderWidth: 1, borderColor: theme.goldBorder,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.surface2,
  },
  stepValue: { fontSize: 16, fontWeight: '700', color: theme.gold, minWidth: 28, textAlign: 'center' },
  fontRow: { flexDirection: 'row', gap: 8 },
  fontBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, borderColor: theme.goldBorder,
  },
  fontBtnText: { fontSize: 13, fontWeight: '600' },

  planRow: {
    gap: 4,
  },

  // Subscription card
  subsCard: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: theme.borderSubtle,
  },
  subsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pricePill: {
    backgroundColor: `${theme.gold}20`,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.goldBorder,
  },
  pricePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.gold,
  },
  subsFeatures: {
    gap: 8,
    paddingLeft: 4,
  },
  subsFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subsFeatureText: {
    fontSize: 13,
    color: theme.textSub,
  },
  subsCTA: {
    backgroundColor: theme.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  subsCTAText: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.bg,
    letterSpacing: 0.3,
  },
  subsFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 12,
  },
  subsFooterText: {
    fontSize: 11,
    color: theme.textMuted,
  },

  apiKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.goldBorder,
    borderRadius: 10,
    backgroundColor: theme.surface2,
    paddingHorizontal: 12,
    width: '100%',
  },
  apiKeyInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.text,
    fontFamily: 'monospace',
  },
  apiKeyEye: {
    padding: 4,
  },
  apiKeyStatus: {
    fontSize: 11,
    color: theme.textMuted,
  },
});

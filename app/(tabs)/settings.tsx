import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getSetting, setSetting } from '../../db/settings';
import { getAllMeditations } from '../../db/meditations';
import { getDb } from '../../db/schema';
import { theme } from '../../constants/theme';

const NOTIFICATION_ID = 'daily-reading-reminder';

async function scheduleReminder(hour: number, minute: number) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: '오늘의 만나',
      body: '매일 한 챕터, 오늘의 말씀을 읽어보세요',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

async function cancelReminder() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export default function SettingsScreen() {
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifHour, setNotifHour] = useState(8);
  const [notifMinute, setNotifMinute] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const enabled = await getSetting('notification_enabled', '0');
      const hour = parseInt(await getSetting('notification_hour', '8'), 10);
      const minute = parseInt(await getSetting('notification_minute', '0'), 10);
      setNotifEnabled(enabled === '1');
      setNotifHour(hour);
      setNotifMinute(minute);
    })();
  }, []);

  async function toggleNotification(value: boolean) {
    if (value) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('알림 권한 필요', '설정 앱에서 알림 권한을 허용해주세요.');
        return;
      }
      await scheduleReminder(notifHour, notifMinute);
    } else {
      await cancelReminder();
    }
    setNotifEnabled(value);
    await setSetting('notification_enabled', value ? '1' : '0');
  }

  async function changeHour(delta: number) {
    const next = (notifHour + delta + 24) % 24;
    setNotifHour(next);
    await setSetting('notification_hour', String(next));
    if (notifEnabled) await scheduleReminder(next, notifMinute);
  }

  async function changeMinute(delta: number) {
    const next = (notifMinute + delta + 60) % 60;
    setNotifMinute(next);
    await setSetting('notification_minute', String(next));
    if (notifEnabled) await scheduleReminder(notifHour, next);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const db = await getDb();
      const readings = await db.getAllAsync<{
        book_id: number; chapter: number; completed_at: string;
      }>('SELECT book_id, chapter, completed_at FROM readings ORDER BY completed_at');
      const meditations = await getAllMeditations();

      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        readings: readings.map(r => ({
          bookId: r.book_id,
          chapter: r.chapter,
          completedAt: r.completed_at,
        })),
        meditations: meditations.map(m => ({
          bookId: m.bookId,
          chapter: m.chapter,
          note: m.note,
          createdAt: m.createdAt,
        })),
      };

      await Share.share({
        message: JSON.stringify(payload, null, 2),
        title: 'Manna 데이터 백업',
      });
    } catch {
      Alert.alert('내보내기 실패', '다시 시도해주세요.');
    } finally {
      setExporting(false);
    }
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>설정</Text>
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

      {/* 데이터 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>데이터</Text>

        <Pressable
          style={({ pressed }) => [styles.row, styles.rowPressable, pressed && styles.rowPressed]}
          onPress={handleExport}
          disabled={exporting}
        >
          <View style={styles.rowLeft}>
            <MaterialCommunityIcons name="export-variant" size={20} color={theme.gold} />
            <Text style={styles.rowLabel}>읽기 기록 내보내기</Text>
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
});

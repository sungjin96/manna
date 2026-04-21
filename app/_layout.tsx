import { Stack, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Image, StyleSheet } from 'react-native';
import * as Notifications from 'expo-notifications';
import { BadgeToastProvider } from '../contexts/BadgeToastContext';
import { UIScaleProvider } from '../contexts/UIScaleContext';
import * as Updates from 'expo-updates';
import { getDb } from '../db/schema';
import { getSetting } from '../db/settings';
import {
  setupNotificationHandler,
  scheduleReadingReminder,
  scheduleVerseNotifications,
  needsVerseReschedule,
  type VerseNotifData,
  type VerseNotifContent,
} from '../utils/notifications';
import { configureRevenueCat } from '../utils/subscriptions';
import { theme } from '../constants/theme';

// Show alerts even when app is in foreground (noop on Android Expo Go)
setupNotificationHandler();

type AppState = 'loading' | 'db_init' | 'updating' | 'ready';

/** 알림 데이터에서 네비게이션 함수 생성 */
function buildNavFromData(data: Record<string, unknown> | undefined): (() => void) | null {
  if (!data) return null;
  if (data.type === 'verse') {
    const d = data as unknown as VerseNotifData;
    if (d.bookId && d.chapter) {
      return () => router.push(
        `/read/${d.bookId}/${d.chapter}?verse=${d.verse}&openMeditation=1`
      );
    }
  }
  return null;
}

export default function RootLayout() {
  const [appState, setAppState] = useState<AppState>('loading');
  // 콜드스타트 시 라우터 준비 전에 받은 알림 탭 → ready 후 실행
  const pendingNavRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    initialize();

    // 앱이 알림 탭으로 열렸을 때 (cold start) — 라우터 미준비일 수 있으므로 ref에 저장
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) {
        pendingNavRef.current = buildNavFromData(
          response.notification.request.content.data as Record<string, unknown>
        );
      }
    });

    // 앱이 포그라운드/백그라운드에서 알림 탭 받을 때 — 이미 ready 상태이므로 즉시 실행
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const nav = buildNavFromData(
        response.notification.request.content.data as Record<string, unknown>
      );
      nav?.();
    });

    return () => sub.remove();
  }, []);

  // appState가 ready로 바뀌면 대기 중인 알림 탭 처리
  useEffect(() => {
    if (appState === 'ready' && pendingNavRef.current) {
      // Stack이 마운트된 뒤 실행되도록 한 프레임 지연
      const timer = setTimeout(() => {
        pendingNavRef.current?.();
        pendingNavRef.current = null;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [appState]);

  async function initialize() {
    // DB 초기화 — 첫 설치 시 에셋 복사 타이밍 이슈로 실패할 수 있으므로 최대 3회 재시도
    let dbReady = false;
    for (let attempt = 0; attempt < 3 && !dbReady; attempt++) {
      try {
        await getDb();
        dbReady = true;
      } catch (err) {
        console.error(`DB init attempt ${attempt + 1} failed:`, err);
        if (attempt < 2) {
          setAppState('db_init');
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }
    }
    configureRevenueCat();

    // Re-register notifications on app start
    try {
      // 읽기 알람
      const enabled = await getSetting('notification_enabled', '0');
      if (enabled === '1') {
        const hour = parseInt(await getSetting('notification_hour', '8'), 10);
        const minute = parseInt(await getSetting('notification_minute', '0'), 10);
        await scheduleReadingReminder(hour, minute);
      }

      // 말씀 알림 — 10일치 커버리지가 줄어들면 리스케줄
      const verseEnabled = await getSetting('verse_notif_enabled', '0');
      if (verseEnabled === '1') {
        const shouldReschedule = await needsVerseReschedule();
        if (shouldReschedule) {
          const timesJson = await getSetting('verse_notif_times', '["21:00"]');
          const times: string[] = JSON.parse(timesJson);
          const content = await getSetting('verse_notif_content', 'verse') as VerseNotifContent;
          await scheduleVerseNotifications(times, content);
        }
      }
    } catch {
      // Best-effort — 알림 실패로 앱 크래시 방지
    }

    // Auto OTA update — blocking check prevents home screen flash
    if (!__DEV__) {
      try {
        const autoUpdate = await getSetting('auto_update', '1');
        if (autoUpdate === '1') {
          const { isAvailable } = await Updates.checkForUpdateAsync();
          if (isAvailable) {
            setAppState('updating');
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
            return; // reloadAsync restarts the app — nothing after this runs
          }
        }
      } catch {
        // Best-effort — silent failure, proceed to app normally
      }
    }

    setAppState('ready');
  }

  // 네이티브 스플래시와 동일한 화면 유지 (크기·색상 일치 → 전환 이질감 없음)
  if (appState !== 'ready') {
    return (
      <View style={styles.splash}>
        <Image
          source={require('../assets/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        {appState === 'updating' && (
          <View style={styles.updateBox}>
            <ActivityIndicator color={theme.gold} size="large" />
            <Text style={styles.updateText}>업데이트 중입니다...</Text>
            <Text style={styles.updateSub}>잠시만 기다려 주세요</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <UIScaleProvider>
    <BadgeToastProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="tutorial-read"
          options={{ headerShown: false, animation: 'fade' }}
        />
        <Stack.Screen
          name="read/[bookId]/[chapter]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.gold,
            headerTitleStyle: { color: theme.text },
            headerShadowVisible: false,
          }}
        />
      </Stack>
    </BadgeToastProvider>
    </UIScaleProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0B0A12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  spinner: {
    marginTop: 8,
  },
  updateBox: {
    position: 'absolute',
    bottom: 80,
    alignItems: 'center',
    gap: 10,
  },
  updateText: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  updateSub: {
    color: theme.textMuted,
    fontSize: 13,
  },
});

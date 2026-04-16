import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { BadgeToastProvider } from '../contexts/BadgeToastContext';
import { UIScaleProvider } from '../contexts/UIScaleContext';
import * as Updates from 'expo-updates';
import { getDb } from '../db/schema';
import { getSetting } from '../db/settings';
import { setupNotificationHandler, scheduleReadingReminder } from '../utils/notifications';
import { configureRevenueCat } from '../utils/subscriptions';
import { theme } from '../constants/theme';

// Show alerts even when app is in foreground (noop on Android Expo Go)
setupNotificationHandler();

type AppState = 'loading' | 'updating' | 'ready';

export default function RootLayout() {
  const [appState, setAppState] = useState<AppState>('loading');

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    // Initialize DB & RevenueCat
    getDb().catch(console.error);
    configureRevenueCat();

    // Re-register notification on app start
    try {
      const enabled = await getSetting('notification_enabled', '0');
      if (enabled === '1') {
        const hour = parseInt(await getSetting('notification_hour', '8'), 10);
        const minute = parseInt(await getSetting('notification_minute', '0'), 10);
        await scheduleReadingReminder(hour, minute);
      }
    } catch {
      // Best-effort — don't crash app if notification re-registration fails
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

  // Loading / Updating: 로고 표시 (스플래시와 연속감 유지)
  if (appState !== 'ready') {
    return (
      <View style={styles.splash}>
        <Image
          source={require('../assets/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        {appState === 'updating' && (
          <>
            <ActivityIndicator color={theme.gold} size="large" style={styles.spinner} />
            <Text style={styles.updateText}>업데이트 중입니다...</Text>
            <Text style={styles.updateSub}>잠시만 기다려 주세요</Text>
          </>
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
    backgroundColor: theme.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  logo: {
    width: 120,
    height: 120,
  },
  spinner: {
    marginTop: 8,
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

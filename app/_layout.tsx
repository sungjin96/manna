import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { BadgeToastProvider } from '../contexts/BadgeToastContext';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { getDb } from '../db/schema';
import { getSetting } from '../db/settings';
import { scheduleReadingReminder } from '../utils/notifications';
import { configureRevenueCat } from '../utils/subscriptions';
import { theme } from '../constants/theme';

// Show alerts even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    // Initialize DB on first mount
    getDb().catch(console.error);

    // Configure RevenueCat (no-op if API key not set)
    configureRevenueCat();

    // Re-register notification on app start (in case system cleared it)
    (async () => {
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
    })();

    // Auto OTA update on startup
    (async () => {
      try {
        if (__DEV__) return;
        const autoUpdate = await getSetting('auto_update', '1');
        if (autoUpdate !== '1') return;
        const { isAvailable } = await Updates.checkForUpdateAsync();
        if (isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // Best-effort — silent failure
      }
    })();
  }, []);

  return (
    <BadgeToastProvider>
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <Stack.Screen name="(tabs)" />
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
  );
}

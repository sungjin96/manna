import { Stack } from 'expo-router';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { getDb } from '../db/schema';
import { getSetting } from '../db/settings';
import { scheduleReadingReminder } from '../utils/notifications';
import { theme } from '../constants/theme';

// Show alerts even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    // Initialize DB on first mount
    getDb().catch(console.error);

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
  }, []);

  return (
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
  );
}

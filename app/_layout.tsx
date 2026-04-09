import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { getDb } from '../db/schema';
import { theme } from '../constants/theme';

export default function RootLayout() {
  useEffect(() => {
    // Initialize DB on first mount
    getDb().catch(console.error);
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

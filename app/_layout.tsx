import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { getDb } from '../db/schema';

export default function RootLayout() {
  useEffect(() => {
    // Initialize DB on first mount
    getDb().catch(console.error);
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="read/[bookId]/[chapter]" options={{ headerShown: true }} />
    </Stack>
  );
}

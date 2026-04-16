// Android Expo Go SDK 53: expo-notifications remote push 미지원
// development build에서는 실제 구현 사용 필요
export const NOTIFICATION_ID = 'daily-reading-reminder';

export function setupNotificationHandler(): void {}

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}

export async function scheduleReadingReminder(_hour: number, _minute: number): Promise<void> {}

export async function cancelReadingReminder(): Promise<void> {}

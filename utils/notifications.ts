import * as Notifications from 'expo-notifications';

export const NOTIFICATION_ID = 'daily-reading-reminder';

export async function scheduleReadingReminder(hour: number, minute: number): Promise<void> {
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

export async function cancelReadingReminder(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

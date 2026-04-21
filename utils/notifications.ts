import * as Notifications from 'expo-notifications';
import { getDailyEntry } from './daily-meditation';

// ─── 식별자 ───────────────────────────────────────────────────────────────────
export const READING_REMINDER_ID = 'daily-reading-reminder';
const VERSE_NOTIF_PREFIX = 'verse-notif-';

// ─── 알림 표시 핸들러 (앱 포그라운드에서 수신 시에도 표시) ────────────────────
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// ─── 권한 요청 ────────────────────────────────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ═══════════════════════════════════════════════════════════════════════════════
// 읽기 알람 — "성경 읽을 시간이에요" 단순 알람 (매일 동일 시간)
// ═══════════════════════════════════════════════════════════════════════════════

export async function scheduleReadingReminder(hour: number, minute: number): Promise<void> {
  // 기존 읽기 알람만 취소 (말씀 알림은 건드리지 않음)
  await Notifications.cancelScheduledNotificationAsync(READING_REMINDER_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: READING_REMINDER_ID,
    content: {
      title: '오늘의 만나',
      body: '오늘도 말씀을 읽어보세요',
      sound: true,
      data: { type: 'reading_reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelReadingReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(READING_REMINDER_ID).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════════
// 말씀 알림 — 오늘의 말씀 + 묵상 질문 (날짜별 사전 스케줄)
// ═══════════════════════════════════════════════════════════════════════════════

export interface VerseNotifData {
  type: 'verse';
  bookId: number;
  chapter: number;
  verse: number;
}

/** 알림에 표시할 콘텐츠 타입 */
export type VerseNotifContent = 'verse' | 'question' | 'both';

/**
 * 말씀 알림 스케줄링:
 * times = ["21:00"] 형태 (단일 시간).
 * content = 'verse' | 'question' | 'both' — 알림 본문 스타일.
 * 오늘부터 10일치를 날짜별 특정 알림으로 예약.
 */
export async function scheduleVerseNotifications(
  times: string[],
  content: VerseNotifContent = 'verse',
): Promise<void> {
  await cancelVerseNotifications();
  if (times.length === 0) return;

  const now = new Date();

  for (let dayOffset = 0; dayOffset < 10; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    const dateISO = date.toISOString().slice(0, 10);

    const entry = getDailyEntry(dateISO);
    if (!entry) continue;

    // 콘텐츠 타입에 따라 본문 구성
    const verseSnippet =
      entry.text.length > 60 ? entry.text.slice(0, 60) + '…' : entry.text;

    let notifBody: string;
    if (content === 'verse') {
      notifBody = verseSnippet;
    } else if (content === 'question') {
      notifBody = entry.question;
    } else {
      // both: 구절 + 질문 (질문이 짤리지 않도록 구절을 더 짧게)
      const shortSnippet =
        entry.text.length > 35 ? entry.text.slice(0, 35) + '…' : entry.text;
      notifBody = `${shortSnippet}\n\n${entry.question}`;
    }

    for (const timeStr of times) {
      const [hourStr, minStr] = timeStr.split(':');
      const hour = parseInt(hourStr, 10);
      const minute = parseInt(minStr, 10);

      const fireDate = new Date(date);
      fireDate.setHours(hour, minute, 0, 0);
      if (fireDate <= now) continue;

      const identifier =
        `${VERSE_NOTIF_PREFIX}${dateISO.replace(/-/g, '')}-${timeStr.replace(':', '')}`;

      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: entry.ref,        // 예: "시편 23:1"
          body: notifBody,
          sound: true,
          data: {
            type: 'verse',
            bookId: entry.bookId,
            chapter: entry.chapter,
            verse: entry.verse,
          } satisfies VerseNotifData,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireDate,
        },
      });
    }
  }
}

export async function cancelVerseNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(n => n.identifier.startsWith(VERSE_NOTIF_PREFIX))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

/**
 * 남은 말씀 알림이 5일치 미만이면 true — 리스케줄 필요 여부 판단용.
 */
export async function needsVerseReschedule(): Promise<boolean> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const verseNotifs = scheduled.filter(n => n.identifier.startsWith(VERSE_NOTIF_PREFIX));
  return verseNotifs.length < 5;
}

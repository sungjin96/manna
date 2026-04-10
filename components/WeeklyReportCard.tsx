import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getWeeklyReadings } from '../db/readings';
import { theme } from '../constants/theme';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function getMondayOfWeek(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  return monday;
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function motivationText(total: number): string {
  if (total === 0) return '이번 주 첫 챕터를 읽어보세요';
  if (total <= 2) return '좋은 시작이에요. 계속 가볼까요?';
  if (total <= 4) return '이번 주도 꾸준히 읽고 있어요';
  if (total <= 6) return '훌륭해요. 거의 매일 읽고 있네요';
  return '완벽한 한 주예요!';
}

export default function WeeklyReportCard() {
  const [weekData, setWeekData] = useState<Map<string, number>>(new Map());
  const [totalChapters, setTotalChapters] = useState(0);

  useEffect(() => {
    getWeeklyReadings().then(data => {
      setWeekData(data);
      setTotalChapters(Array.from(data.values()).reduce((s, n) => s + n, 0));
    }).catch(() => {});
  }, []);

  const monday = getMondayOfWeek();
  const today = fmt(new Date());

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = fmt(d);
    const count = weekData.get(dateStr) ?? 0;
    const isToday = dateStr === today;
    const isPast = dateStr < today;
    return { label: DAY_LABELS[i], dateStr, count, isToday, isPast };
  });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>이번 주 읽기</Text>
        <Text style={styles.count}>{totalChapters}챕터</Text>
      </View>

      {/* 7-day grid */}
      <View style={styles.grid}>
        {days.map(day => (
          <View key={day.dateStr} style={styles.dayCol}>
            {/* Bar: height proportional to chapters (max 3 shown) */}
            <View style={styles.barTrack}>
              {day.count > 0 && (
                <View
                  style={[
                    styles.bar,
                    { height: Math.min(day.count, 3) * 10 + 8 },
                  ]}
                />
              )}
            </View>
            {/* Chapter count */}
            <Text style={[styles.dayCount, { color: day.count > 0 ? theme.gold : theme.textMuted }]}>
              {day.count > 0 ? day.count : ''}
            </Text>
            {/* Day label */}
            <Text style={[
              styles.dayLabel,
              day.isToday && styles.dayLabelToday,
              !day.isPast && !day.isToday && styles.dayLabelFuture,
            ]}>
              {day.label}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.motivation}>{motivationText(totalChapters)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 14, fontWeight: '700', color: theme.text },
  count: { fontSize: 13, color: theme.gold, fontWeight: '700' },

  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  dayCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  barTrack: {
    height: 40,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
  },
  bar: {
    width: 10,
    borderRadius: 5,
    backgroundColor: theme.gold,
    opacity: 0.85,
  },
  dayCount: {
    fontSize: 10,
    fontWeight: '600',
    height: 14,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textSub,
  },
  dayLabelToday: {
    color: theme.gold,
  },
  dayLabelFuture: {
    color: theme.textMuted,
    opacity: 0.5,
  },

  motivation: {
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
  },
});

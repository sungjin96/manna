import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getReadingDates } from '../db/readings';
import { theme } from '../constants/theme';

// 요일 레이블 (일~토)
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
// 월 레이블
const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월',
                      '7월', '8월', '9월', '10월', '11월', '12월'];

const CELL = 13;  // cell size px
const GAP = 2;    // gap px

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface WeekCol {
  days: Array<{ dateStr: string; inRange: boolean }>;  // 7 slots (Sun-Sat)
  monthLabel?: string;  // shown if month changes at this column
}

function buildGrid(readDates: Set<string>): WeekCol[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start: go back 52 weeks from the Sunday at or before today
  const todayDow = today.getDay(); // 0=Sun
  const sunday = new Date(today);
  sunday.setDate(sunday.getDate() - todayDow);

  const startDate = new Date(sunday);
  startDate.setDate(startDate.getDate() - 51 * 7); // 52 weeks total

  const cols: WeekCol[] = [];
  let prevMonth = -1;

  for (let w = 0; w < 52; w++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + w * 7);

    const days: WeekCol['days'] = [];
    let monthLabel: string | undefined;

    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + d);
      const inRange = day <= today;
      const dateStr = toYMD(day);

      if (d === 0 && day.getMonth() !== prevMonth && inRange) {
        monthLabel = MONTH_LABELS[day.getMonth()];
        prevMonth = day.getMonth();
      }

      days.push({ dateStr, inRange });
    }
    cols.push({ days, monthLabel });
  }

  return cols;
}

interface Props {
  /** Pro 전용: false면 블러 없이 잠금 안내 표시 */
  isPro?: boolean;
  /** isPro=false일 때 잠금 탭 시 호출 */
  onUpgrade?: () => void;
}

export default function StreakHeatmap({ isPro = true, onUpgrade }: Props) {
  const [readDates, setReadDates] = useState<Set<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    getReadingDates().then(setReadDates).catch(() => {});
  }, []);

  // Scroll to end (most recent = rightmost) after mount
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, []);

  const cols = buildGrid(readDates);

  function cellColor(dateStr: string, inRange: boolean): string {
    if (!inRange) return 'transparent';
    return readDates.has(dateStr) ? theme.gold : `${theme.gold}18`;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>읽기 기록</Text>
        <Text style={styles.count}>{readDates.size}일</Text>
      </View>

      <View style={styles.gridWrapper}>
        {/* Day-of-week labels */}
        <View style={styles.dayLabels}>
          {DAY_LABELS.map((label, i) => (
            <Text key={i} style={styles.dayLabel}>{i % 2 === 0 ? label : ''}</Text>
          ))}
        </View>

        {/* Heatmap grid */}
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={isPro}
          style={{ opacity: isPro ? 1 : 0.35 }}
        >
          <View>
            {/* Month labels row */}
            <View style={styles.monthRow}>
              {cols.map((col, wi) => (
                <View key={wi} style={styles.monthCell}>
                  {col.monthLabel ? (
                    <Text style={styles.monthLabel}>{col.monthLabel}</Text>
                  ) : null}
                </View>
              ))}
            </View>

            {/* Week columns */}
            <View style={styles.grid}>
              {cols.map((col, wi) => (
                <View key={wi} style={styles.weekCol}>
                  {col.days.map(({ dateStr, inRange }, di) => (
                    <View
                      key={di}
                      style={[
                        styles.cell,
                        { backgroundColor: cellColor(dateStr, inRange) },
                        readDates.has(dateStr) && styles.cellDone,
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>

      {!isPro && (
        <Pressable
          style={({ pressed }) => [styles.lockOverlay, pressed && { opacity: 0.85 }]}
          onPress={onUpgrade}
        >
          <View style={styles.lockIconBadge}>
            <MaterialCommunityIcons name="crown" size={20} color={theme.gold} />
          </View>
          <Text style={styles.lockText}>Pro 전용 기능</Text>
          <Text style={styles.lockSub}>탭해서 연간 읽기 기록 잠금 해제</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 14, fontWeight: '700', color: theme.text },
  count: { fontSize: 13, color: theme.gold, fontWeight: '600' },

  gridWrapper: { flexDirection: 'row' },

  dayLabels: {
    width: 18,
    paddingTop: 14, // align with month label row height
    gap: GAP,
    marginRight: 4,
  },
  dayLabel: {
    height: CELL,
    lineHeight: CELL,
    fontSize: 9,
    color: theme.textMuted,
    textAlign: 'right',
  },

  monthRow: {
    flexDirection: 'row',
    height: 14,
    marginBottom: 2,
  },
  monthCell: {
    width: CELL + GAP,
    alignItems: 'flex-start',
  },
  monthLabel: {
    fontSize: 9,
    color: theme.textMuted,
  },

  grid: { flexDirection: 'row', gap: GAP },
  weekCol: { gap: GAP },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 3,
  },
  cellDone: {
    // slight glow effect for completed days
    shadowColor: theme.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
  },

  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: `${theme.surface}CC`,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    gap: 6,
  },
  lockIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.goldBg,
    borderWidth: 1,
    borderColor: theme.goldBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  lockText: { fontSize: 14, fontWeight: '700', color: theme.text },
  lockSub: { fontSize: 12, color: theme.textSub, textAlign: 'center' },
});

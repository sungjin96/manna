import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getStats, type UserStats } from '../db/stats';
import { getReadingDates, getWeeklyReadings } from '../db/readings';
import StreakHeatmap from '../components/StreakHeatmap';
import { theme } from '../constants/theme';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export default function ReadingHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [readingDates, setReadingDates] = useState<Set<string>>(new Set());
  const [weeklyData, setWeeklyData] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    getStats().then(setStats);
    getReadingDates().then(setReadingDates);
    getWeeklyReadings().then(setWeeklyData);
  }, []);

  // 이번 주 읽은 일수
  const thisWeekDays = weeklyData.size;

  // 지난 주 읽은 일수 계산
  const lastWeekDays = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const lastMonday = new Date(monday);
    lastMonday.setDate(monday.getDate() - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);

    let count = 0;
    const d = new Date(lastMonday);
    while (d <= lastSunday) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (readingDates.has(key)) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  })();

  // 주로 읽는 요일 (상위 3개)
  const dayFrequency = (() => {
    const counts = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
    readingDates.forEach(dateStr => {
      const d = new Date(dateStr + 'T00:00:00');
      const dow = d.getDay(); // 0=Sun
      const idx = dow === 0 ? 6 : dow - 1; // Mon=0
      counts[idx]++;
    });
    return counts
      .map((c, i) => ({ day: DAY_LABELS[i], count: c }))
      .sort((a, b) => b.count - a.count)
      .filter(d => d.count > 0)
      .slice(0, 3);
  })();

  // 올해 읽은 일수
  const thisYear = new Date().getFullYear();
  const yearDays = (() => {
    let count = 0;
    readingDates.forEach(d => { if (d.startsWith(String(thisYear))) count++; });
    return count;
  })();

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* 헤더 */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={theme.gold} />
        </Pressable>
        <Text style={s.headerTitle}>읽기 기록</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* 통계 카드 */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statEmoji}>🔥</Text>
            <Text style={s.statValue}>{stats?.currentStreak ?? 0}</Text>
            <Text style={s.statLabel}>연속 읽기</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statEmoji}>🏆</Text>
            <Text style={s.statValue}>{stats?.longestStreak ?? 0}</Text>
            <Text style={s.statLabel}>최장 기록</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statEmoji}>📖</Text>
            <Text style={s.statValue}>{yearDays}</Text>
            <Text style={s.statLabel}>올해 읽은 날</Text>
          </View>
        </View>

        {/* 히트맵 */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>연간 기록</Text>
          <StreakHeatmap isPro onUpgrade={() => {}} />
        </View>

        {/* 주간 비교 */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>주간 비교</Text>
          <View style={s.weekCompare}>
            <View style={s.weekCol}>
              <Text style={s.weekValue}>{thisWeekDays}/7</Text>
              <Text style={s.weekLabel}>이번 주</Text>
            </View>
            <View style={s.weekDivider} />
            <View style={s.weekCol}>
              <Text style={s.weekValue}>{lastWeekDays}/7</Text>
              <Text style={s.weekLabel}>지난 주</Text>
            </View>
          </View>
        </View>

        {/* 읽기 패턴 */}
        {dayFrequency.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>자주 읽는 요일</Text>
            <View style={s.patternRow}>
              {dayFrequency.map((d, i) => (
                <View key={d.day} style={[s.patternChip, i === 0 && s.patternChipTop]}>
                  <Text style={[s.patternDay, i === 0 && s.patternDayTop]}>{d.day}</Text>
                  <Text style={[s.patternCount, i === 0 && s.patternCountTop]}>{d.count}일</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 총 통계 */}
        <View style={[s.section, { marginBottom: insets.bottom + 20 }]}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>총 읽은 챕터</Text>
            <Text style={s.totalValue}>{stats?.totalChapters ?? 0}장</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>총 읽은 일수</Text>
            <Text style={s.totalValue}>{readingDates.size}일</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  content: { padding: 16, gap: 20 },

  // 통계 카드
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: theme.surface, borderRadius: 14, paddingVertical: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  statEmoji: { fontSize: 22, marginBottom: 2 },
  statValue: { fontSize: 24, fontWeight: '800', color: theme.gold },
  statLabel: { fontSize: 11, color: theme.textMuted },

  // 섹션
  section: {
    backgroundColor: theme.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: theme.textMuted,
    letterSpacing: 0.5, marginBottom: 12,
  },

  // 주간 비교
  weekCompare: { flexDirection: 'row', alignItems: 'center' },
  weekCol: { flex: 1, alignItems: 'center', gap: 4 },
  weekValue: { fontSize: 28, fontWeight: '800', color: theme.gold },
  weekLabel: { fontSize: 12, color: theme.textMuted },
  weekDivider: {
    width: 1, height: 40, backgroundColor: theme.border, marginHorizontal: 12,
  },

  // 읽기 패턴
  patternRow: { flexDirection: 'row', gap: 10 },
  patternChip: {
    flex: 1, alignItems: 'center', gap: 2,
    paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: theme.borderSubtle,
  },
  patternChipTop: { borderColor: theme.gold, backgroundColor: 'rgba(212,168,71,0.08)' },
  patternDay: { fontSize: 15, fontWeight: '700', color: theme.textSub },
  patternDayTop: { color: theme.gold },
  patternCount: { fontSize: 11, color: theme.textMuted },
  patternCountTop: { color: theme.gold },

  // 총 통계
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8,
  },
  totalLabel: { fontSize: 14, color: theme.textSub },
  totalValue: { fontSize: 14, fontWeight: '700', color: theme.gold },
});

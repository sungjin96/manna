import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getAllMeditations, searchMeditations, updateMeditation, deleteMeditation, Meditation } from '../../db/meditations';
import { BOOKS } from '../../constants/books';
import { theme } from '../../constants/theme';
import MeditationShareCard from '../../components/MeditationShareCard';
import MannaAlert from '../../components/MannaAlert';

const MEMO_COLOR = '#7AA3D4';
type ViewMode = 'list' | 'calendar';
type FilterType = 'all' | 'meditation' | 'memo';
type FilterSort = 'newest' | 'oldest';
type FilterQA = 'all' | 'complete' | 'incomplete';

// ── 노트 타입 감지 ──────────────────────────────────────────────────────────
function getNoteType(note: string): 'memo' | 'qa' | 'basic' {
  try {
    const p = JSON.parse(note);
    if (p?.type === 'memo') return 'memo';
    if (p?.type === 'qa' && Array.isArray(p.entries)) return 'qa';
  } catch {}
  return 'basic';
}

function highlight(text: string, query: string): { part: string; match: boolean }[] {
  if (!query.trim()) return [{ part: text, match: false }];
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map(part => ({ part, match: regex.test(part) }));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function renderNotePreview(note: string): string {
  const type = getNoteType(note);
  try {
    const parsed = JSON.parse(note);
    if (type === 'memo') return parsed.text ?? note;
    if (type === 'qa') {
      return parsed.entries
        .filter((e: { q: string; a: string }) => e.q || e.a)
        .map((e: { q: string; a: string }, i: number) => `Q${i + 1}. ${e.q}\n${e.a}`)
        .join('\n\n');
    }
  } catch {}
  return note;
}

function bookChapterLabel(bookId: number, chapter: number, verseStart?: number, verseEnd?: number): string {
  const book = BOOKS.find(b => b.id === bookId);
  const base = book ? book.name : String(bookId);
  if (verseStart !== undefined) {
    const range = verseEnd !== undefined && verseEnd !== verseStart ? `${verseStart}–${verseEnd}` : String(verseStart);
    return `${base} ${chapter}:${range}`;
  }
  return book ? `${book.name} ${chapter}장` : `${bookId}:${chapter}`;
}

// ── 캘린더 헬퍼 ────────────────────────────────────────────────────────────
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildCalendarCells(month: Date): Array<{ date: Date | null; key: string | null }> {
  const y = month.getFullYear(), m = month.getMonth();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Mon=0, Sun=6
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: Array<{ date: Date | null; key: string | null }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ date: null, key: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    cells.push({ date, key: toDateKey(date) });
  }
  return cells;
}

// ── 캘린더 컴포넌트 ────────────────────────────────────────────────────────
function CalendarView({
  items,
  onDaySelect,
  selectedDay,
}: {
  items: Meditation[];
  onDaySelect: (key: string | null) => void;
  selectedDay: string | null;
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const meditationsByDate = useMemo(() => {
    const map: Record<string, { hasMeditation: boolean; hasMemo: boolean }> = {};
    for (const item of items) {
      const key = item.createdAt.slice(0, 10);
      if (!map[key]) map[key] = { hasMeditation: false, hasMemo: false };
      if (getNoteType(item.note) === 'memo') {
        map[key].hasMemo = true;
      } else {
        map[key].hasMeditation = true;
      }
    }
    return map;
  }, [items]);

  const cells = useMemo(() => buildCalendarCells(month), [month]);
  const todayKey = toDateKey(new Date());

  function prevMonth() {
    setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    onDaySelect(null);
  }
  function nextMonth() {
    setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));
    onDaySelect(null);
  }

  const CELL_SIZE = Math.floor((Dimensions.get('window').width - 32) / 7);

  return (
    <View style={calStyles.wrap}>
      {/* Month header */}
      <View style={calStyles.monthHeader}>
        <Pressable onPress={prevMonth} hitSlop={12} style={calStyles.monthNav}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={calStyles.monthLabel}>
          {month.getFullYear()}년 {month.getMonth() + 1}월
        </Text>
        <Pressable onPress={nextMonth} hitSlop={12} style={calStyles.monthNav}>
          <MaterialCommunityIcons name="chevron-right" size={22} color={theme.text} />
        </Pressable>
      </View>

      {/* Weekday header */}
      <View style={calStyles.weekRow}>
        {WEEKDAYS.map(d => (
          <View key={d} style={[calStyles.cell, { width: CELL_SIZE }]}>
            <Text style={[calStyles.weekDay, d === '일' && { color: '#E07A7A' }, d === '토' && { color: '#7AA3D4' }]}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      <View style={calStyles.grid}>
        {cells.map((cell, idx) => {
          if (!cell.date || !cell.key) {
            return <View key={`empty-${idx}`} style={[calStyles.cell, { width: CELL_SIZE }]} />;
          }
          const marks = meditationsByDate[cell.key];
          const isToday = cell.key === todayKey;
          const isSelected = cell.key === selectedDay;
          const dow = (cell.date.getDay() + 6) % 7; // Mon=0
          const isSun = dow === 6;
          const isSat = dow === 5;

          return (
            <Pressable
              key={cell.key}
              style={[calStyles.cell, { width: CELL_SIZE }]}
              onPress={() => onDaySelect(isSelected ? null : cell.key)}
              hitSlop={2}
            >
              <View style={[
                calStyles.dayCircle,
                isSelected && calStyles.dayCircleSelected,
                isToday && !isSelected && calStyles.dayCircleToday,
              ]}>
                <Text style={[
                  calStyles.dayNum,
                  isSun && { color: '#E07A7A' },
                  isSat && { color: '#7AA3D4' },
                  isSelected && { color: theme.bg, fontWeight: '800' },
                  isToday && !isSelected && { color: theme.gold, fontWeight: '800' },
                ]}>
                  {cell.date.getDate()}
                </Text>
              </View>
              {/* Dots */}
              {marks && (
                <View style={calStyles.dotsRow}>
                  {marks.hasMeditation && <View style={[calStyles.dot, { backgroundColor: theme.gold }]} />}
                  {marks.hasMemo && <View style={[calStyles.dot, { backgroundColor: MEMO_COLOR }]} />}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────
export default function MeditationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Meditation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterSort, setFilterSort] = useState<FilterSort>('newest');
  const [filterQA, setFilterQA] = useState<FilterQA>('all');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Meditation | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editQaEntries, setEditQaEntries] = useState<{ q: string; a: string }[]>([]);
  const [editIsQa, setEditIsQa] = useState(false);
  const [editIsMemo, setEditIsMemo] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Meditation | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    const data = q.trim() ? await searchMeditations(q) : await getAllMeditations();
    setItems(data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(query); }, [load]));

  function handleQueryChange(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(text), 300);
  }

  function handleClearQuery() {
    setQuery('');
    load('');
  }

  function openEdit(item: Meditation) {
    setEditTarget(item);
    const type = getNoteType(item.note);
    try {
      const parsed = JSON.parse(item.note);
      if (type === 'memo') {
        setEditIsMemo(true);
        setEditIsQa(false);
        setEditNote(parsed.text ?? '');
        return;
      }
      if (type === 'qa') {
        setEditIsQa(true);
        setEditIsMemo(false);
        setEditQaEntries(parsed.entries.map((e: { q: string; a: string }) => ({ q: e.q ?? '', a: e.a ?? '' })));
        setEditNote('');
        return;
      }
    } catch {}
    setEditIsQa(false);
    setEditIsMemo(false);
    setEditNote(item.note);
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    let noteToSave: string;
    if (editIsMemo) {
      noteToSave = JSON.stringify({ type: 'memo', text: editNote.trim() });
    } else if (editIsQa) {
      noteToSave = JSON.stringify({ type: 'qa', entries: editQaEntries });
    } else {
      noteToSave = editNote.trim();
    }
    await updateMeditation(editTarget.id, noteToSave);
    setEditTarget(null);
    load(query);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await deleteMeditation(deleteTarget.id);
    setDeleteTarget(null);
    load(query);
  }

  // 필터 적용
  const filteredItems = useMemo(() => {
    let result = [...items];

    if (filterType === 'memo') {
      result = result.filter(m => getNoteType(m.note) === 'memo');
    } else if (filterType === 'meditation') {
      result = result.filter(m => getNoteType(m.note) !== 'memo');
    }

    if (filterType !== 'memo' && filterQA !== 'all') {
      result = result.filter(m => {
        const type = getNoteType(m.note);
        if (type === 'basic') return filterQA === 'complete';
        if (type === 'qa') {
          try {
            const parsed = JSON.parse(m.note);
            const allAnswered = parsed.entries.every((e: { q: string; a: string }) => e.a?.trim().length > 0);
            return filterQA === 'complete' ? allAnswered : !allAnswered;
          } catch { return false; }
        }
        return true;
      });
    }

    if (filterSort === 'oldest') {
      result = result.reverse();
    }

    return result;
  }, [items, filterType, filterSort, filterQA]);

  // 캘린더 모드에서 선택된 날의 기록
  const dayItems = useMemo(() => {
    if (!selectedDay) return [];
    return filteredItems.filter(m => m.createdAt.slice(0, 10) === selectedDay);
  }, [filteredItems, selectedDay]);

  // 리스트 모드에서 표시할 아이템
  const listItems = viewMode === 'list' ? filteredItems : dayItems;

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>불러오는 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>기록</Text>
          <Text style={styles.headerSub}>{items.length}개</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setViewMode('list')}
            hitSlop={8}
            style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
          >
            <MaterialCommunityIcons
              name="format-list-bulleted"
              size={20}
              color={viewMode === 'list' ? theme.gold : theme.textMuted}
            />
          </Pressable>
          <Pressable
            onPress={() => setViewMode('calendar')}
            hitSlop={8}
            style={[styles.viewToggleBtn, viewMode === 'calendar' && styles.viewToggleBtnActive]}
          >
            <MaterialCommunityIcons
              name="calendar-month-outline"
              size={20}
              color={viewMode === 'calendar' ? theme.gold : theme.textMuted}
            />
          </Pressable>
        </View>
      </View>

      {/* 검색바 — 리스트 모드만 */}
      {viewMode === 'list' && (
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="묵상·메모 검색..."
            placeholderTextColor={theme.textMuted}
            value={query}
            onChangeText={handleQueryChange}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={handleClearQuery} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={16} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
      )}

      {/* 필터 칩 row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
      >
        {(['all', 'meditation', 'memo'] as FilterType[]).map(type => (
          <Pressable
            key={type}
            style={[styles.filterChip, filterType === type && styles.filterChipActive]}
            onPress={() => setFilterType(type)}
          >
            <Text style={[styles.filterChipText, filterType === type && styles.filterChipTextActive]}>
              {type === 'all' ? '전체' : type === 'meditation' ? '묵상' : '메모'}
            </Text>
          </Pressable>
        ))}

        <View style={styles.filterSep} />

        {(['newest', 'oldest'] as FilterSort[]).map(sort => (
          <Pressable
            key={sort}
            style={[styles.filterChip, filterSort === sort && styles.filterChipActive]}
            onPress={() => setFilterSort(sort)}
          >
            <Text style={[styles.filterChipText, filterSort === sort && styles.filterChipTextActive]}>
              {sort === 'newest' ? '최신순' : '오래된순'}
            </Text>
          </Pressable>
        ))}

        {filterType !== 'memo' && (
          <>
            <View style={styles.filterSep} />
            {(['all', 'complete', 'incomplete'] as FilterQA[]).map(qa => (
              <Pressable
                key={qa}
                style={[styles.filterChip, filterQA === qa && styles.filterChipActive]}
                onPress={() => setFilterQA(qa)}
              >
                <Text style={[styles.filterChipText, filterQA === qa && styles.filterChipTextActive]}>
                  {qa === 'all' ? 'Q&A 전체' : qa === 'complete' ? '완성' : '미완성'}
                </Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      {/* 캘린더 뷰 */}
      {viewMode === 'calendar' && (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <CalendarView
            items={filteredItems}
            onDaySelect={setSelectedDay}
            selectedDay={selectedDay}
          />

          {/* 선택된 날 레코드 */}
          {selectedDay && (
            <View style={styles.dayRecordsWrap}>
              <Text style={styles.dayRecordsLabel}>
                {selectedDay.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1년 $2월 $3일')}
              </Text>
              {dayItems.length === 0 ? (
                <View style={styles.dayEmpty}>
                  <Text style={styles.dayEmptyText}>이날 기록이 없어요</Text>
                </View>
              ) : (
                dayItems.map(item => (
                  <MeditationCard
                    key={item.id}
                    item={item}
                    query=""
                    router={router}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                  />
                ))
              )}
            </View>
          )}
          {!selectedDay && (
            <View style={styles.calendarHint}>
              <Text style={styles.calendarHintText}>날짜를 탭하면 그날의 기록을 볼 수 있어요</Text>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: theme.gold }]} />
                <Text style={styles.legendText}>묵상</Text>
                <View style={[styles.legendDot, { backgroundColor: MEMO_COLOR }]} />
                <Text style={styles.legendText}>메모</Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* 리스트 뷰 */}
      {viewMode === 'list' && (
        <>
          {filteredItems.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons
                name={query ? 'text-search' : 'notebook-outline'}
                size={48}
                color={theme.textMuted}
              />
              <Text style={styles.emptyText}>
                {query ? '검색 결과가 없어요' : (filterType !== 'all' || filterQA !== 'all') ? '해당하는 기록이 없어요' : '아직 기록이 없어요'}
              </Text>
              <Text style={styles.emptyHint}>
                {query ? '다른 단어로 검색해보세요' : (filterType !== 'all' || filterQA !== 'all') ? '필터를 바꿔보세요' : '성경을 읽고 묵상·메모를 남겨보세요'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={listItems}
              keyExtractor={item => String(item.id)}
              contentContainerStyle={styles.list}
              keyboardDismissMode="on-drag"
              renderItem={({ item }) => (
                <MeditationCard
                  item={item}
                  query={query}
                  router={router}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              )}
            />
          )}
        </>
      )}

      {/* 수정 모달 */}
      <Modal visible={editTarget !== null} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFillObject} onPress={Keyboard.dismiss} />
          <View style={styles.modal}>
            <View style={styles.modalHandle} />
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>{editIsMemo ? '메모 수정' : '묵상 수정'}</Text>
              {editIsMemo && (
                <View style={[styles.typeBadge, { backgroundColor: `${MEMO_COLOR}22`, borderColor: `${MEMO_COLOR}44` }]}>
                  <View style={[styles.typeBadgeDot, { backgroundColor: MEMO_COLOR }]} />
                  <Text style={[styles.typeBadgeText, { color: MEMO_COLOR }]}>메모</Text>
                </View>
              )}
            </View>
            {editTarget && (
              <Text style={styles.modalSub}>
                {bookChapterLabel(editTarget.bookId, editTarget.chapter, editTarget.verseStart, editTarget.verseEnd)}
              </Text>
            )}

            {editIsQa ? (
              <ScrollView style={styles.qaScrollWrap} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {editQaEntries.map((entry, i) => (
                  <View key={i} style={styles.qaEntry}>
                    <View style={styles.qaRow}>
                      <Text style={styles.qaNum}>{i + 1}</Text>
                      <View style={styles.qaInputCol}>
                        <TextInput
                          style={styles.qaQ}
                          placeholder="질문을 입력하세요"
                          placeholderTextColor={theme.textMuted}
                          multiline
                          value={entry.q}
                          onChangeText={(text) => {
                            const updated = [...editQaEntries];
                            updated[i] = { ...updated[i], q: text };
                            setEditQaEntries(updated);
                          }}
                        />
                        <View style={styles.qaDiv} />
                        <TextInput
                          style={styles.qaA}
                          placeholder="묵상 내용..."
                          placeholderTextColor={theme.textMuted}
                          multiline
                          value={entry.a}
                          onChangeText={(text) => {
                            const updated = [...editQaEntries];
                            updated[i] = { ...updated[i], a: text };
                            setEditQaEntries(updated);
                          }}
                        />
                      </View>
                      {editQaEntries.length > 1 && (
                        <Pressable hitSlop={10} onPress={() => setEditQaEntries(prev => prev.filter((_, idx) => idx !== i))}>
                          <MaterialCommunityIcons name="close" size={15} color={theme.textMuted} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
                {editQaEntries.length < 5 && (
                  <Pressable
                    style={styles.addPairBtn}
                    onPress={() => setEditQaEntries(prev => [...prev, { q: '', a: '' }])}
                    hitSlop={8}
                  >
                    <MaterialCommunityIcons name="plus" size={14} color={theme.textMuted} />
                    <Text style={styles.addPairText}>질문 추가</Text>
                  </Pressable>
                )}
              </ScrollView>
            ) : (
              <>
                <TextInput
                  style={styles.textInput}
                  placeholder={editIsMemo ? '메모 내용...' : '묵상 내용...'}
                  placeholderTextColor={theme.textMuted}
                  multiline
                  maxLength={2000}
                  value={editNote}
                  onChangeText={setEditNote}
                  autoFocus
                />
                <Text style={styles.charCount}>{editNote.length}/2000</Text>
              </>
            )}

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setEditTarget(null)}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, (!editIsQa && !editNote.trim()) && styles.saveBtnDisabled]}
                onPress={handleSaveEdit}
                disabled={!editIsQa && !editNote.trim()}
              >
                <Text style={styles.saveBtnText}>저장</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 삭제 확인 */}
      <MannaAlert
        visible={deleteTarget !== null}
        title="기록 삭제"
        message="이 기록을 삭제할까요?"
        buttons={[
          { text: '취소', style: 'cancel' },
          { text: '삭제', style: 'destructive', onPress: confirmDelete },
        ]}
        onDismiss={() => setDeleteTarget(null)}
      />
    </View>
  );
}

// ── 카드 컴포넌트 ───────────────────────────────────────────────────────────
function MeditationCard({
  item,
  query,
  router,
  onEdit,
  onDelete,
}: {
  item: Meditation;
  query: string;
  router: ReturnType<typeof useRouter>;
  onEdit: (item: Meditation) => void;
  onDelete: (item: Meditation) => void;
}) {
  const noteType = getNoteType(item.note);
  const preview = renderNotePreview(item.note);
  const segments = highlight(preview, query);
  const isMemo = noteType === 'memo';

  return (
    <Pressable
      style={[styles.card, isMemo && styles.cardMemo]}
      onPress={() => router.push(`/read/${item.bookId}/${item.chapter}${item.verseStart ? `?verse=${item.verseStart}` : ''}`)}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardTopLeft}>
          <View style={[styles.typeBadge, isMemo
            ? { backgroundColor: `${MEMO_COLOR}15`, borderColor: `${MEMO_COLOR}33` }
            : { backgroundColor: `${theme.gold}15`, borderColor: `${theme.gold}33` }
          ]}>
            <View style={[styles.typeBadgeDot, { backgroundColor: isMemo ? MEMO_COLOR : theme.gold }]} />
            <Text style={[styles.typeBadgeText, { color: isMemo ? MEMO_COLOR : theme.gold }]}>
              {isMemo ? '메모' : noteType === 'qa' ? 'Q&A' : '묵상'}
            </Text>
          </View>
          <Text style={styles.cardRef}>{bookChapterLabel(item.bookId, item.chapter, item.verseStart, item.verseEnd)}</Text>
        </View>
        <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
      </View>
      <Text style={styles.cardNote} numberOfLines={4}>
        {segments.map((seg, i) =>
          seg.match
            ? <Text key={i} style={styles.cardNoteHighlight}>{seg.part}</Text>
            : seg.part
        )}
      </Text>
      <Pressable style={styles.cardActions} onPress={(e) => e.stopPropagation()}>
        <MeditationShareCard
          verseRef={bookChapterLabel(item.bookId, item.chapter, item.verseStart, item.verseEnd)}
          noteText={item.note}
          date={formatDate(item.createdAt)}
          bookId={item.bookId}
          chapter={item.chapter}
          verseStart={item.verseStart}
          verseEnd={item.verseEnd}
        />
        <Pressable style={styles.actionBtn} onPress={() => onEdit(item)} hitSlop={8}>
          <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.textMuted} />
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => onDelete(item)} hitSlop={8}>
          <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.textMuted} />
        </Pressable>
      </Pressable>
    </Pressable>
  );
}

// ── 스타일 ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' },
  muted: { color: theme.textMuted, fontSize: 14 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },
  headerSub: { fontSize: 13, color: theme.textMuted },
  headerRight: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  viewToggleBtn: {
    padding: 8,
    borderRadius: 8,
  },
  viewToggleBtnActive: {
    backgroundColor: `${theme.gold}15`,
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 16, color: theme.textSub, fontWeight: '600' },
  emptyHint: { fontSize: 13, color: theme.textMuted },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: theme.text, padding: 0 },

  list: { padding: 16, paddingTop: 4, gap: 12 },

  card: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardMemo: {
    // 왼쪽 border 제거 — 배지 색상으로 충분히 구분됨
  },
  filterRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  filterRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  filterChipActive: {
    backgroundColor: theme.gold,
    borderColor: theme.gold,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textMuted,
  },
  filterChipTextActive: {
    color: theme.bg,
  },
  filterSep: {
    width: 1,
    height: 20,
    backgroundColor: theme.border,
    marginHorizontal: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardRef: { fontSize: 13, fontWeight: '700', color: theme.gold },
  cardDate: { fontSize: 11, color: theme.textMuted },
  cardNote: { fontSize: 15, lineHeight: 22, color: theme.text },
  cardNoteHighlight: {
    color: theme.goldLight,
    fontWeight: '700',
    backgroundColor: `${theme.gold}22`,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 12,
  },
  actionBtn: { padding: 4 },

  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeDot: { width: 5, height: 5, borderRadius: 2.5 },
  typeBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  // 캘린더 관련
  dayRecordsWrap: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  dayRecordsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textSub,
    marginBottom: 4,
    marginTop: 4,
  },
  dayEmpty: { alignItems: 'center', paddingVertical: 24 },
  dayEmptyText: { color: theme.textMuted, fontSize: 14 },
  calendarHint: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 32,
    gap: 10,
  },
  calendarHintText: { fontSize: 13, color: theme.textMuted },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 12, color: theme.textMuted },

  // 수정 모달
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 44,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  modalHandle: {
    width: 40, height: 4,
    backgroundColor: theme.borderSubtle,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: theme.text },
  modalSub: { fontSize: 13, color: theme.gold, marginBottom: 16 },
  textInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    color: theme.text,
    backgroundColor: theme.surface2,
  },
  charCount: { fontSize: 11, color: theme.textMuted, textAlign: 'right', marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, padding: 15, borderRadius: 12,
    borderWidth: 1, borderColor: theme.borderSubtle, alignItems: 'center',
  },
  cancelBtnText: { color: theme.textSub, fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 1, padding: 15, borderRadius: 12,
    backgroundColor: theme.gold, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: theme.bg, fontSize: 15, fontWeight: '700' },
  qaScrollWrap: { maxHeight: 320 },
  qaEntry: { marginBottom: 12 },
  qaRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  qaNum: { fontSize: 13, fontWeight: '700', width: 16, lineHeight: 22, color: theme.gold },
  qaInputCol: { flex: 1 },
  qaQ: { fontSize: 15, lineHeight: 22, paddingVertical: 0, minHeight: 22, color: theme.text },
  qaDiv: { height: StyleSheet.hairlineWidth, marginVertical: 8, backgroundColor: theme.border },
  qaA: { fontSize: 14, lineHeight: 21, paddingVertical: 0, minHeight: 44, opacity: 0.85, color: theme.text },
  addPairBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  addPairText: { fontSize: 12, color: theme.textMuted },
});

const calStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  monthNav: { padding: 4 },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    alignItems: 'center',
    paddingVertical: 4,
    height: 52,
  },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    backgroundColor: theme.gold,
  },
  dayCircleToday: {
    borderWidth: 1.5,
    borderColor: theme.gold,
  },
  dayNum: {
    fontSize: 14,
    color: theme.text,
  },
  weekDay: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    textAlign: 'center',
    width: '100%',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

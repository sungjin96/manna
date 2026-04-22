import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useUIScale } from '../../contexts/UIScaleContext';
import { useTabletLayout } from '../../contexts/TabletLayoutContext';
import MasterDetailLayout from '../../components/MasterDetailLayout';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  saveMeditationReturningId,
  updateMeditation,
  deleteMeditation,
  setPrayerGroup,
  Meditation,
} from '../../db/meditations';
import { getPrayerMeditations } from '../../db/meditations';
import {
  getPrayerGroups,
  createPrayerGroup,
  renamePrayerGroup,
  deletePrayerGroup,
  PrayerGroup,
} from '../../db/prayer_groups';
import { theme } from '../../constants/theme';
import {
  parsePrayerNote,
  searchPrayerMeditations,
  toggleAnsweredNote,
  makePrayerNote,
} from '../../utils/prayer-utils';
import MannaAlert from '../../components/MannaAlert';
import SwipeableRow from '../../components/SwipeableRow';
import PrayerShareCard, { capturePrayerCard, type PrayerShareItem } from '../../components/PrayerShareCard';

type FilterTab = 'all' | 'unanswered' | 'answered';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function PrayersScreen() {
  const { scale } = useUIScale();
  const { isTabletLandscape } = useTabletLayout();
  const styles = useMemo(() => makeStyles(scale), [scale]);
  const insets = useSafeAreaInsets();
  const [prayers, setPrayers] = useState<Meditation[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const filterSheetY = useRef(new Animated.Value(400)).current;

  function openFilterSheet() {
    filterSheetY.setValue(400);
    setShowFilterSheet(true);
    Animated.spring(filterSheetY, { toValue: 0, friction: 9, tension: 100, useNativeDriver: true }).start();
  }

  function closeFilterSheet() {
    Animated.timing(filterSheetY, { toValue: 400, duration: 220, useNativeDriver: true }).start(() => setShowFilterSheet(false));
  }

  const filterSheetPR = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, { dy }) => { if (dy > 0) filterSheetY.setValue(dy); },
    onPanResponderRelease: (_, { dy, vy }) => {
      if (dy > 80 || vy > 0.5) {
        Animated.timing(filterSheetY, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => setShowFilterSheet(false));
      } else {
        Animated.spring(filterSheetY, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

  // 그룹
  const [groups, setGroups] = useState<PrayerGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null); // null = 전체

  // 입력 모달
  const [showInput, setShowInput] = useState(false);
  const [inputText, setInputText] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [inputGroupId, setInputGroupId] = useState<number | null>(null);

  // 선택 모드
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // 카드 이미지 공유
  const prayerCardRef = useRef<ViewShot>(null);
  const [shareItems, setShareItems] = useState<PrayerShareItem[]>([]);
  const [isSharing, setIsSharing] = useState(false);

  // 삭제 confirm
  const [deleteTarget, setDeleteTarget] = useState<Meditation | null>(null);
  const [showMultiDeleteConfirm, setShowMultiDeleteConfirm] = useState(false);

  // 그룹 만들기
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [groupCreateText, setGroupCreateText] = useState('');

  // 그룹 관리 (칩 롱프레스)
  const [groupActionTarget, setGroupActionTarget] = useState<PrayerGroup | null>(null);
  const [showGroupRename, setShowGroupRename] = useState(false);
  const [groupRenameText, setGroupRenameText] = useState('');

  // 그룹 삭제 confirm
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<PrayerGroup | null>(null);

  const loadAll = useCallback(() => {
    getPrayerMeditations().then(setPrayers);
    getPrayerGroups().then(setGroups);
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const filtered = useCallback(() => {
    let list = searchPrayerMeditations(prayers, query);
    if (selectedGroupId !== null) {
      list = list.filter(m => m.prayerGroupId === selectedGroupId);
    }
    if (filter === 'all') return list;
    return list.filter(m => {
      const p = parsePrayerNote(m.note);
      if (!p) return false;
      return filter === 'answered' ? p.is_answered : !p.is_answered;
    });
  }, [prayers, query, filter, selectedGroupId])();

  async function handleSave() {
    const text = inputText.trim();
    if (!text) return;

    if (editingId !== null) {
      const target = prayers.find(m => m.id === editingId);
      if (target) {
        const oldParsed = parsePrayerNote(target.note);
        const updated = JSON.stringify({
          type: 'prayer',
          content: text,
          is_answered: oldParsed?.is_answered ?? false,
        });
        await updateMeditation(editingId, updated);
        await setPrayerGroup(editingId, inputGroupId);
      }
    } else {
      const newId = await saveMeditationReturningId(0, 0, makePrayerNote(text));
      if (newId > 0) {
        await setPrayerGroup(newId, inputGroupId);
      }
    }

    setShowInput(false);
    setInputText('');
    setEditingId(null);
    setInputGroupId(null);
    getPrayerMeditations().then(setPrayers);
  }

  function enterSelectMode(item: Meditation) {
    setIsSelectMode(true);
    setSelectedIds(new Set([item.id]));
  }

  function exitSelectMode() {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(item: Meditation) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  function selectAll() {
    const allSelected = filtered.length > 0 && filtered.every(m => selectedIds.has(m.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(m => m.id)));
    }
  }

  async function handleMultiShare() {
    if (isSharing) return;
    const items = prayers
      .filter(m => selectedIds.has(m.id))
      .map(m => ({
        content: parsePrayerNote(m.note)?.content ?? '',
        groupName: m.prayerGroupId ? groups.find(g => g.id === m.prayerGroupId)?.name : null,
        date: formatDate(m.createdAt),
      }));
    setShareItems(items);
    setIsSharing(true);
    setTimeout(async () => {
      try {
        await capturePrayerCard(prayerCardRef);
      } catch {
        // 캡처 실패 시 텍스트로 fallback
        await Share.share({ message: items.map(i => i.content).join('\n') });
      } finally {
        setIsSharing(false);
      }
    }, 80);
  }

  async function handleMultiDelete() {
    await Promise.all([...selectedIds].map(id => deleteMeditation(id)));
    exitSelectMode();
    setShowMultiDeleteConfirm(false);
    getPrayerMeditations().then(setPrayers);
  }

  async function handleToggleAnswered(item: Meditation) {
    const p = parsePrayerNote(item.note);
    if (!p) return;
    const updated = toggleAnsweredNote(item.note, !p.is_answered);
    await updateMeditation(item.id, updated);
    getPrayerMeditations().then(setPrayers);
  }

  function handleEdit(item: Meditation) {
    const p = parsePrayerNote(item.note);
    if (!p) return;
    setInputText(p.content);
    setEditingId(item.id);
    setInputGroupId(item.prayerGroupId ?? null);
    setShowInput(true);
  }

  async function handleDelete(item: Meditation) {
    await deleteMeditation(item.id);
    setDeleteTarget(null);
    getPrayerMeditations().then(setPrayers);
  }

  async function handleCreateGroup() {
    const name = groupCreateText.trim();
    if (!name) return;
    await createPrayerGroup(name);
    setGroupCreateText('');
    setShowGroupCreate(false);
    getPrayerGroups().then(setGroups);
  }

  async function handleRenameGroup() {
    if (!groupActionTarget) return;
    const name = groupRenameText.trim();
    if (!name) return;
    await renamePrayerGroup(groupActionTarget.id, name);
    setShowGroupRename(false);
    setGroupActionTarget(null);
    getPrayerGroups().then(setGroups);
  }

  async function handleDeleteGroup(group: PrayerGroup) {
    await deletePrayerGroup(group.id);
    if (selectedGroupId === group.id) setSelectedGroupId(null);
    setGroupDeleteTarget(null);
    setGroupActionTarget(null);
    loadAll();
  }

  const allSelected = isSelectMode && filtered.length > 0 && filtered.every(m => selectedIds.has(m.id));
  const answeredCount = prayers.filter(m => parsePrayerNote(m.note)?.is_answered).length;
  const totalCount = prayers.length;

  const baseContent = (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>기도제목</Text>
        <Text style={styles.headerSub}>
          {totalCount}개{answeredCount > 0 ? ` · 응답됨 ${answeredCount}개` : ''}
        </Text>
      </View>

      {/* 검색바 */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={18} color={theme.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="기도제목 검색..."
          placeholderTextColor={theme.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={16} color={theme.textMuted} />
          </Pressable>
        )}
      </View>

      {/* 필터 인디케이터 행 */}
      <View style={styles.filterIndicatorRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterIndicatorChips}
        >
          {selectedGroupId !== null && (
            <View style={styles.filterActiveChip}>
              <MaterialCommunityIcons name="label-outline" size={12} color={theme.gold} />
              <Text style={styles.filterActiveChipText}>
                {groups.find(g => g.id === selectedGroupId)?.name ?? '그룹'}
              </Text>
              <Pressable onPress={() => setSelectedGroupId(null)} hitSlop={6}>
                <MaterialCommunityIcons name="close" size={12} color={theme.gold} />
              </Pressable>
            </View>
          )}
          {filter !== 'all' && (
            <View style={styles.filterActiveChip}>
              <Text style={styles.filterActiveChipText}>
                {filter === 'unanswered' ? '기도 중' : '응답됨'}
              </Text>
              <Pressable onPress={() => setFilter('all')} hitSlop={6}>
                <MaterialCommunityIcons name="close" size={12} color={theme.gold} />
              </Pressable>
            </View>
          )}
          {selectedGroupId === null && filter === 'all' && (
            <Text style={styles.filterNoneText}>전체 보기</Text>
          )}
        </ScrollView>

        <Pressable
          onPress={openFilterSheet}
          hitSlop={8}
          style={[styles.filterTuneBtn, (selectedGroupId !== null || filter !== 'all') && styles.filterTuneBtnActive]}
        >
          <MaterialCommunityIcons
            name="tune-variant"
            size={18}
            color={(selectedGroupId !== null || filter !== 'all') ? theme.gold : theme.textMuted}
          />
          {(selectedGroupId !== null || filter !== 'all') && (
            <View style={styles.filterActiveDot} />
          )}
        </Pressable>
      </View>

      {/* 필터 바텀시트 */}
      <Modal visible={showFilterSheet} transparent animationType="fade">
        <Pressable style={styles.sheetOverlay} onPress={closeFilterSheet} />
        <Animated.View style={[styles.filterSheet, { transform: [{ translateY: filterSheetY }] }]}>
          <View style={styles.sheetHandle} {...filterSheetPR.panHandlers} />
          <Text style={styles.sheetTitle}>필터</Text>

          {/* 그룹 */}
          <Text style={styles.sheetSectionLabel}>그룹</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sheetChipsRow}
            style={{ marginBottom: 18 }}
          >
            <Pressable
              style={[styles.groupChip, selectedGroupId === null && styles.groupChipActive]}
              onPress={() => setSelectedGroupId(null)}
            >
              <Text style={[styles.groupChipText, selectedGroupId === null && styles.groupChipTextActive]}>
                전체
              </Text>
            </Pressable>
            {groups.map(g => (
              <Pressable
                key={g.id}
                style={[styles.groupChip, selectedGroupId === g.id && styles.groupChipActive]}
                onPress={() => setSelectedGroupId(prev => prev === g.id ? null : g.id)}
                onLongPress={() => {
                  setGroupActionTarget(g);
                  setGroupRenameText(g.name);
                  setShowFilterSheet(false);
                }}
                delayLongPress={400}
              >
                <Text style={[styles.groupChipText, selectedGroupId === g.id && styles.groupChipTextActive]}>
                  {g.name}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.groupChip, styles.groupChipAdd]}
              onPress={() => { setGroupCreateText(''); setShowFilterSheet(false); setShowGroupCreate(true); }}
            >
              <MaterialCommunityIcons name="plus" size={13} color={theme.textMuted} />
              <Text style={[styles.groupChipText, { marginLeft: 2 }]}>추가</Text>
            </Pressable>
          </ScrollView>

          {/* 상태 필터 */}
          <Text style={styles.sheetSectionLabel}>상태</Text>
          <View style={styles.sheetChipsRow}>
            {(['all', 'unanswered', 'answered'] as FilterTab[]).map(tab => (
              <Pressable
                key={tab}
                style={[styles.groupChip, filter === tab && styles.groupChipActive]}
                onPress={() => setFilter(tab)}
              >
                <Text style={[styles.groupChipText, filter === tab && styles.groupChipTextActive]}>
                  {tab === 'all' ? '전체' : tab === 'unanswered' ? '기도 중' : '응답됨'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={styles.sheetCloseBtn}
            onPress={closeFilterSheet}
          >
            <Text style={styles.sheetCloseBtnText}>닫기</Text>
          </Pressable>
        </Animated.View>
      </Modal>

      {/* 목록 */}
      <FlatList
        data={filtered}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="hands-pray" size={40} color={theme.textMuted} />
            <Text style={styles.emptyText}>
              {query ? '검색 결과가 없습니다' : '기도제목을 등록해보세요'}
            </Text>
            {!query && (
              <Text style={styles.emptyHint}>아래 + 버튼으로 기도제목을 추가할 수 있어요</Text>
            )}
          </View>
        }
        ListFooterComponent={
          prayers.length > 0 && !isSelectMode ? (
            <Text style={styles.selectHint}>길게 눌러 여러 개 선택 가능</Text>
          ) : null
        }
        renderItem={({ item }) => {
          const p = parsePrayerNote(item.note);
          if (!p) return null;
          const groupName = item.prayerGroupId
            ? groups.find(g => g.id === item.prayerGroupId)?.name
            : null;
          const isSelected = selectedIds.has(item.id);
          return (
            <SwipeableRow
              style={styles.swipeRow}
              disabled={isSelectMode}
              rightActions={[
                {
                  icon: p.is_answered ? 'circle-outline' : 'check-circle-outline',
                  label: p.is_answered ? '미완료' : '완료',
                  color: p.is_answered ? '#888' : theme.gold,
                  onPress: () => handleToggleAnswered(item),
                },
                {
                  icon: 'pencil-outline',
                  label: '수정',
                  color: '#4A7CF7',
                  onPress: () => handleEdit(item),
                },
                {
                  icon: 'trash-can-outline',
                  label: '삭제',
                  color: '#E05252',
                  onPress: () => setDeleteTarget(item),
                },
              ]}
            >
              <Pressable
                style={[
                  styles.card,
                  p.is_answered && styles.cardAnswered,
                  isSelectMode && isSelected && styles.cardSelected,
                ]}
                onPress={() => { if (isSelectMode) toggleSelect(item); }}
                onLongPress={() => { if (!isSelectMode) enterSelectMode(item); }}
                delayLongPress={400}
              >
                {/* 선택 모드에서만 왼쪽 체크박스 */}
                {isSelectMode && (
                  <MaterialCommunityIcons
                    name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                    size={24}
                    color={isSelected ? theme.gold : `${theme.textMuted}70`}
                  />
                )}

                {/* 내용 */}
                <View style={styles.cardContent}>
                  {groupName && (
                    <View style={styles.cardGroupBadge}>
                      <Text style={styles.cardGroupText}>{groupName}</Text>
                    </View>
                  )}
                  <Text
                    style={[styles.cardText, p.is_answered && styles.cardTextAnswered]}
                    numberOfLines={3}
                  >
                    {p.content}
                  </Text>
                  <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
                </View>
              </Pressable>
            </SwipeableRow>
          );
        }}
      />

      {/* 추가 버튼 — 선택 모드에서 숨김 */}
      {!isSelectMode && (
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
          onPress={() => {
            setInputText('');
            setEditingId(null);
            setInputGroupId(selectedGroupId);
            setShowInput(true);
          }}
        >
          <MaterialCommunityIcons name="plus" size={26} color={theme.bg} />
        </Pressable>
      )}

      {/* 선택 모드 글라스 pill 플로팅 바 */}
      {isSelectMode && (
        <View style={[styles.selectionBarWrap, { bottom: Math.max(insets.bottom, 16) + 8 }]}>
          {/* 선택 수 배지 */}
          <Text style={styles.selectionCount}>
            {selectedIds.size > 0 ? `${selectedIds.size}개 선택됨` : '항목을 선택하세요'}
          </Text>

          {/* 글라스 pill */}
          <View style={styles.selectionBar}>
            <Pressable onPress={selectAll} style={styles.selectionBarBtn}>
              <MaterialCommunityIcons
                name={allSelected ? 'select-off' : 'select-all'}
                size={22}
                color={theme.textSub}
              />
              <Text style={styles.selectionBarBtnText}>
                {allSelected ? '전체해제' : '전체선택'}
              </Text>
            </Pressable>

            <View style={styles.selectionBarDivider} />

            <Pressable
              onPress={handleMultiShare}
              style={[styles.selectionBarBtn, selectedIds.size === 0 && styles.selectionBarBtnDisabled]}
              disabled={selectedIds.size === 0 || isSharing}
            >
              {isSharing
                ? <ActivityIndicator size="small" color="#5B9BD5" />
                : <MaterialCommunityIcons name="share-variant-outline" size={22} color={selectedIds.size > 0 ? '#5B9BD5' : theme.textMuted} />
              }
              <Text style={[styles.selectionBarBtnText, selectedIds.size > 0 && { color: '#5B9BD5' }]}>공유</Text>
            </Pressable>

            <View style={styles.selectionBarDivider} />

            <Pressable
              onPress={() => { if (selectedIds.size > 0) setShowMultiDeleteConfirm(true); }}
              style={[styles.selectionBarBtn, selectedIds.size === 0 && styles.selectionBarBtnDisabled]}
              disabled={selectedIds.size === 0}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={22} color={selectedIds.size > 0 ? '#E05252' : theme.textMuted} />
              <Text style={[styles.selectionBarBtnText, selectedIds.size > 0 && { color: '#E05252' }]}>삭제</Text>
            </Pressable>

            <View style={styles.selectionBarDivider} />

            <Pressable onPress={exitSelectMode} style={styles.selectionBarBtn}>
              <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
              <Text style={styles.selectionBarBtnText}>닫기</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 카드 이미지 공유용 hidden 렌더 */}
      <PrayerShareCard items={shareItems} cardRef={prayerCardRef} />

      {/* ─── 입력 모달 ─── */}
      <Modal visible={showInput} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => { setShowInput(false); Keyboard.dismiss(); }}
          />
          <View style={styles.inputSheet}>
            <View style={styles.inputHandle} />
            <Text style={styles.inputTitle}>
              {editingId !== null ? '기도제목 수정' : '기도제목 등록'}
            </Text>
            <TextInput
              style={styles.inputField}
              placeholder="기도제목을 입력하세요..."
              placeholderTextColor={theme.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              autoFocus
              maxLength={500}
              returnKeyType="default"
            />
            <Text style={styles.inputCount}>{inputText.length} / 500</Text>

            {/* 그룹 선택 */}
            {groups.length > 0 && (
              <View style={styles.groupPickerWrap}>
                <Text style={styles.groupPickerLabel}>그룹</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.groupPickerChips}>
                    <Pressable
                      style={[
                        styles.groupPickerChip,
                        inputGroupId === null && styles.groupPickerChipActive,
                      ]}
                      onPress={() => setInputGroupId(null)}
                    >
                      <Text style={[
                        styles.groupPickerChipText,
                        inputGroupId === null && styles.groupPickerChipTextActive,
                      ]}>없음</Text>
                    </Pressable>
                    {groups.map(g => (
                      <Pressable
                        key={g.id}
                        style={[
                          styles.groupPickerChip,
                          inputGroupId === g.id && styles.groupPickerChipActive,
                        ]}
                        onPress={() => setInputGroupId(g.id)}
                      >
                        <Text style={[
                          styles.groupPickerChipText,
                          inputGroupId === g.id && styles.groupPickerChipTextActive,
                        ]}>{g.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                pressed && { opacity: 0.85 },
                !inputText.trim() && styles.saveBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={!inputText.trim()}
            >
              <Text style={styles.saveBtnText}>
                {editingId !== null ? '수정 완료' : '등록'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── 그룹 만들기 모달 ─── */}
      <Modal visible={showGroupCreate} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => { setShowGroupCreate(false); Keyboard.dismiss(); }}
          />
          <View style={styles.inputSheet}>
            <View style={styles.inputHandle} />
            <Text style={styles.inputTitle}>그룹 만들기</Text>
            <TextInput
              style={[styles.inputField, { minHeight: 50, maxHeight: 50 }]}
              placeholder="그룹 이름 (예: 가족, 직장, 건강)"
              placeholderTextColor={theme.textMuted}
              value={groupCreateText}
              onChangeText={setGroupCreateText}
              autoFocus
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={handleCreateGroup}
            />
            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                { marginTop: 12 },
                pressed && { opacity: 0.85 },
                !groupCreateText.trim() && styles.saveBtnDisabled,
              ]}
              onPress={handleCreateGroup}
              disabled={!groupCreateText.trim()}
            >
              <Text style={styles.saveBtnText}>만들기</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── 그룹 이름 변경 모달 ─── */}
      <Modal visible={showGroupRename} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => { setShowGroupRename(false); Keyboard.dismiss(); }}
          />
          <View style={styles.inputSheet}>
            <View style={styles.inputHandle} />
            <Text style={styles.inputTitle}>그룹 이름 변경</Text>
            <TextInput
              style={[styles.inputField, { minHeight: 50, maxHeight: 50 }]}
              placeholder="새 이름 입력..."
              placeholderTextColor={theme.textMuted}
              value={groupRenameText}
              onChangeText={setGroupRenameText}
              autoFocus
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={handleRenameGroup}
            />
            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                { marginTop: 12 },
                pressed && { opacity: 0.85 },
                !groupRenameText.trim() && styles.saveBtnDisabled,
              ]}
              onPress={handleRenameGroup}
              disabled={!groupRenameText.trim()}
            >
              <Text style={styles.saveBtnText}>변경</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── 그룹 칩 롱프레스 액션 시트 ─── */}
      <Modal visible={groupActionTarget !== null} transparent animationType="fade">
        <View style={styles.actionOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setGroupActionTarget(null)} />
          <View style={styles.actionSheet}>
            <Text style={styles.actionSheetTitle}>{groupActionTarget?.name}</Text>
            <Pressable
              style={styles.actionSheetBtn}
              onPress={() => {
                setGroupActionTarget(groupActionTarget);
                setShowGroupRename(true);
              }}
            >
              <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.text} />
              <Text style={styles.actionSheetText}>이름 변경</Text>
            </Pressable>
            <Pressable
              style={[styles.actionSheetBtn, styles.actionSheetBtnDanger]}
              onPress={() => {
                const g = groupActionTarget;
                setGroupActionTarget(null);
                if (g) setGroupDeleteTarget(g);
              }}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color="#E05252" />
              <Text style={[styles.actionSheetText, { color: '#E05252' }]}>그룹 삭제</Text>
            </Pressable>
            <Pressable
              style={[styles.actionSheetBtn, styles.actionSheetBtnCancel]}
              onPress={() => setGroupActionTarget(null)}
            >
              <Text style={[styles.actionSheetText, { color: theme.textMuted, textAlign: 'center' }]}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ─── 기도제목 삭제 confirm ─── */}
      <MannaAlert
        visible={!!deleteTarget}
        title="기도제목 삭제"
        message="이 기도제목을 삭제할까요?"
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setDeleteTarget(null) },
          { text: '삭제', style: 'destructive', onPress: () => deleteTarget && handleDelete(deleteTarget) },
        ]}
        onDismiss={() => setDeleteTarget(null)}
      />

      {/* ─── 멀티 삭제 confirm ─── */}
      <MannaAlert
        visible={showMultiDeleteConfirm}
        title="기도제목 삭제"
        message={`선택한 ${selectedIds.size}개의 기도제목을 삭제할까요?`}
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setShowMultiDeleteConfirm(false) },
          { text: '삭제', style: 'destructive', onPress: handleMultiDelete },
        ]}
        onDismiss={() => setShowMultiDeleteConfirm(false)}
      />

      {/* ─── 그룹 삭제 confirm ─── */}
      <MannaAlert
        visible={!!groupDeleteTarget}
        title="그룹 삭제"
        message={`'${groupDeleteTarget?.name}' 그룹을 삭제할까요?\n기도제목은 유지되며 그룹 없음으로 이동돼요.`}
        buttons={[
          { text: '취소', style: 'cancel', onPress: () => setGroupDeleteTarget(null) },
          {
            text: '삭제',
            style: 'destructive',
            onPress: () => groupDeleteTarget && handleDeleteGroup(groupDeleteTarget),
          },
        ]}
        onDismiss={() => setGroupDeleteTarget(null)}
      />
    </View>
  );

  if (isTabletLandscape) {
    return (
      <MasterDetailLayout
        leftFlex={0.35}
        hasSelection={false}
        emptyIcon="hands-pray"
        emptyMessage="기도제목을 선택하면 내용을 볼 수 있어요"
        masterContent={baseContent}
        detailContent={null}
      />
    );
  }

  return baseContent;
}

function makeStyles(scale: number) {
  const fs = (size: number) => Math.round(size * scale);
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },

    header: {
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: 2,
    },
    headerTitle: { fontSize: fs(24), fontWeight: '800', color: theme.text },
    headerSub: { fontSize: fs(13), color: theme.textMuted },

    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      margin: 16,
      marginBottom: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: fs(15),
      color: theme.text,
      padding: 0,
    },

    // ─── 그룹 칩 행 ───
    groupRow: {
      flexGrow: 0,
      marginBottom: 4,
    },
    groupRowContent: {
      paddingHorizontal: 16,
      gap: 8,
      flexDirection: 'row',
      alignItems: 'center',
    },
    groupChip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: 'row',
      alignItems: 'center',
    },
    groupChipActive: {
      backgroundColor: `${theme.gold}20`,
      borderColor: `${theme.gold}60`,
    },
    groupChipAdd: {
      borderColor: theme.textMuted,
      opacity: 0.7,
    },
    groupChipText: { fontSize: fs(13), color: theme.textMuted, fontWeight: '600' },
    groupChipTextActive: { color: theme.gold },

    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      gap: 8,
      marginBottom: 8,
      marginTop: 4,
    },
    filterTab: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    filterTabActive: {
      backgroundColor: `${theme.gold}20`,
      borderColor: `${theme.gold}60`,
    },
    filterTabText: { fontSize: fs(13), color: theme.textMuted, fontWeight: '600' },
    filterTabTextActive: { color: theme.gold },

    list: { paddingHorizontal: 16, paddingBottom: 100 },

    swipeRow: {
      borderRadius: 14,
      marginBottom: 10,
      overflow: 'hidden',
    },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 12,
    },
    cardAnswered: {
      opacity: 0.6,
      borderColor: `${theme.gold}30`,
    },
    checkBtn: { padding: 2 },
    cardContent: { flex: 1, gap: 4 },
    cardGroupBadge: {
      alignSelf: 'flex-start',
      backgroundColor: `${theme.gold}18`,
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
      marginBottom: 2,
    },
    cardGroupText: { fontSize: fs(11), color: theme.gold, fontWeight: '600' },
    cardSelected: {
      borderColor: `${theme.gold}60`,
      backgroundColor: `${theme.gold}0A`,
    },
    cardText: { fontSize: fs(15), color: theme.text, lineHeight: fs(22) },
    cardTextAnswered: { textDecorationLine: 'line-through', color: theme.textSub },
    cardDate: { fontSize: fs(11), color: theme.textMuted },

    empty: {
      paddingTop: 80,
      alignItems: 'center',
      gap: 8,
    },
    emptyText: { fontSize: fs(16), color: theme.textMuted, marginTop: 12 },
    emptyHint: { fontSize: fs(13), color: theme.textMuted },

    fab: {
      position: 'absolute',
      right: 20,
      bottom: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.gold,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },

    // ─── 선택 모드 글라스 pill 플로팅 바 ───
    selectionBarWrap: {
      position: 'absolute',
      left: 16,
      right: 16,
      alignItems: 'center',
      gap: 8,
    },
    selectionCount: {
      fontSize: fs(12),
      fontWeight: '600',
      color: 'rgba(255,255,255,0.55)',
      letterSpacing: 0.3,
    },
    selectionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'stretch',
      backgroundColor: 'rgba(10, 8, 20, 0.94)',
      borderRadius: 28,
      borderWidth: 1,
      borderColor: 'rgba(212,168,71,0.18)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.45,
      shadowRadius: 20,
      elevation: 14,
      paddingVertical: 2,
    },
    selectionBarDivider: {
      width: 1,
      height: 28,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    selectionBarBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 12,
    },
    selectionBarBtnDisabled: { opacity: 0.3 },
    selectionBarBtnText: {
      fontSize: fs(10),
      color: theme.textSub,
      fontWeight: '600',
    },
    selectHint: {
      fontSize: fs(12),
      color: theme.textMuted,
      textAlign: 'center',
      paddingVertical: 16,
      paddingBottom: 100,
    },

    // ─── 액션 시트 ───
    actionOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    actionSheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 8,
      paddingBottom: 32,
      paddingHorizontal: 16,
    },
    actionSheetTitle: {
      fontSize: fs(13),
      color: theme.textMuted,
      fontWeight: '600',
      textAlign: 'center',
      paddingVertical: 10,
    },
    actionSheetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 16,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderSubtle,
    },
    actionSheetBtnDanger: {},
    actionSheetBtnCancel: {
      borderBottomWidth: 0,
      justifyContent: 'center',
      marginTop: 4,
    },
    actionSheetText: {
      fontSize: fs(15),
      color: theme.text,
      fontWeight: '500',
    },

    // ─── 입력 모달 ───
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    inputSheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingHorizontal: 20,
      paddingBottom: 40,
      paddingTop: 12,
    },
    inputHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.textMuted,
      alignSelf: 'center',
      marginBottom: 16,
    },
    inputTitle: { fontSize: fs(16), fontWeight: '700', color: theme.text, marginBottom: 12 },
    inputField: {
      backgroundColor: theme.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      fontSize: fs(15),
      color: theme.text,
      minHeight: 100,
      maxHeight: 200,
      textAlignVertical: 'top',
    },
    inputCount: {
      fontSize: fs(11),
      color: theme.textMuted,
      textAlign: 'right',
      marginTop: 4,
      marginBottom: 8,
    },

    // ─── 그룹 피커 ───
    groupPickerWrap: {
      marginBottom: 12,
      gap: 6,
    },
    groupPickerLabel: {
      fontSize: fs(12),
      color: theme.textMuted,
      fontWeight: '600',
      marginBottom: 2,
    },
    groupPickerChips: {
      flexDirection: 'row',
      gap: 8,
    },
    groupPickerChip: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 16,
      backgroundColor: theme.bg,
      borderWidth: 1,
      borderColor: theme.border,
    },
    groupPickerChipActive: {
      backgroundColor: `${theme.gold}20`,
      borderColor: `${theme.gold}60`,
    },
    groupPickerChipText: { fontSize: fs(12), color: theme.textMuted, fontWeight: '600' },
    groupPickerChipTextActive: { color: theme.gold },

    saveBtn: {
      backgroundColor: theme.gold,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { fontSize: fs(15), fontWeight: '800', color: theme.bg },

    // ─── 필터 인디케이터 행 ───
    filterIndicatorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 8,
      marginTop: 4,
      gap: 8,
    },
    filterTuneBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterTuneBtnActive: {
      backgroundColor: `${theme.gold}15`,
      borderColor: `${theme.gold}40`,
    },
    filterActiveDot: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.gold,
    },
    filterIndicatorChips: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    filterActiveChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: `${theme.gold}15`,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: `${theme.gold}40`,
    },
    filterActiveChipText: {
      fontSize: fs(12),
      color: theme.gold,
      fontWeight: '600',
    },
    filterNoneText: {
      fontSize: fs(12),
      color: theme.textMuted,
    },

    // ─── 필터 바텀시트 ───
    sheetOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    filterSheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingBottom: 36,
      paddingTop: 12,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      alignSelf: 'center',
      marginBottom: 16,
    },
    sheetTitle: {
      fontSize: fs(16),
      fontWeight: '700',
      color: theme.text,
      marginBottom: 18,
    },
    sheetSectionLabel: {
      fontSize: fs(11),
      fontWeight: '600',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 10,
    },
    sheetChipsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    sheetCloseBtn: {
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: 16,
    },
    sheetCloseBtnText: {
      fontSize: fs(13),
      color: theme.textMuted,
      fontWeight: '600',
    },
  });
}

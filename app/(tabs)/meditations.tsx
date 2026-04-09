import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getAllMeditations, updateMeditation, deleteMeditation, Meditation } from '../../db/meditations';
import { BOOKS } from '../../constants/books';
import { theme } from '../../constants/theme';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}.${m}.${day}`;
}

function bookChapterLabel(bookId: number, chapter: number): string {
  const book = BOOKS.find(b => b.id === bookId);
  return book ? `${book.name} ${chapter}장` : `${bookId}:${chapter}`;
}

export default function MeditationsScreen() {
  const [items, setItems] = useState<Meditation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<Meditation | null>(null);
  const [editNote, setEditNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getAllMeditations();
    setItems(data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openEdit(item: Meditation) {
    setEditTarget(item);
    setEditNote(item.note);
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    await updateMeditation(editTarget.id, editNote.trim());
    setEditTarget(null);
    load();
  }

  function handleDelete(item: Meditation) {
    Alert.alert(
      '묵상 삭제',
      '이 묵상 기록을 삭제할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            await deleteMeditation(item.id);
            load();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>불러오는 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>묵상 기록</Text>
        <Text style={styles.headerSub}>{items.length}개</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="notebook-outline" size={48} color={theme.textMuted} />
          <Text style={styles.emptyText}>아직 묵상 기록이 없어요</Text>
          <Text style={styles.emptyHint}>성경을 읽고 나서 묵상을 남겨보세요</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardRef}>{bookChapterLabel(item.bookId, item.chapter)}</Text>
                <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
              </View>
              <Text style={styles.cardNote}>{item.note}</Text>
              <View style={styles.cardActions}>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => openEdit(item)}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.textMuted} />
                </Pressable>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => handleDelete(item)}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.textMuted} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      {/* Edit modal */}
      <Modal visible={editTarget !== null} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>묵상 수정</Text>
            {editTarget && (
              <Text style={styles.modalSub}>
                {bookChapterLabel(editTarget.bookId, editTarget.chapter)}
              </Text>
            )}
            <TextInput
              style={styles.textInput}
              placeholder="묵상 내용..."
              placeholderTextColor={theme.textMuted}
              multiline
              maxLength={200}
              value={editNote}
              onChangeText={setEditNote}
              autoFocus
            />
            <Text style={styles.charCount}>{editNote.length}/200</Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setEditTarget(null)}
              >
                <Text style={styles.cancelBtnText}>취소</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, !editNote.trim() && styles.saveBtnDisabled]}
                onPress={handleSaveEdit}
                disabled={!editNote.trim()}
              >
                <Text style={styles.saveBtnText}>저장</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' },
  muted: { color: theme.textMuted, fontSize: 14 },

  header: {
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: theme.text },
  headerSub: { fontSize: 13, color: theme.textMuted },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 16, color: theme.textSub, fontWeight: '600' },
  emptyHint: { fontSize: 13, color: theme.textMuted },

  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardRef: { fontSize: 13, fontWeight: '700', color: theme.gold },
  cardDate: { fontSize: 11, color: theme.textMuted },
  cardNote: { fontSize: 15, lineHeight: 22, color: theme.text },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 12,
  },
  actionBtn: { padding: 4 },

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
    width: 40,
    height: 4,
    backgroundColor: theme.borderSubtle,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: theme.text, marginBottom: 4 },
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
    flex: 1,
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.borderSubtle,
    alignItems: 'center',
  },
  cancelBtnText: { color: theme.textSub, fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    backgroundColor: theme.gold,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: theme.bg, fontSize: 15, fontWeight: '700' },
});

import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useBibleText } from '../../../hooks/useBibleText';
import { markChapterComplete, isChapterComplete } from '../../../db/readings';
import { saveMeditation } from '../../../db/meditations';
import { BOOKS } from '../../../constants/books';

export default function ReadScreen() {
  const { bookId: bookIdStr, chapter: chapterStr } = useLocalSearchParams<{
    bookId: string;
    chapter: string;
  }>();
  const router = useRouter();

  const bookId = Number(bookIdStr);
  const chapter = Number(chapterStr);
  const book = BOOKS.find(b => b.id === bookId);

  const { verses, loading } = useBibleText(bookId, chapter);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [showMeditation, setShowMeditation] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    isChapterComplete(bookId, chapter).then(setAlreadyDone);
  }, [bookId, chapter]);

  async function handleComplete() {
    if (alreadyDone) return;
    await markChapterComplete(bookId, chapter);
    setAlreadyDone(true);
    setShowMeditation(true);
  }

  async function handleSaveMeditation() {
    if (note.trim()) {
      await saveMeditation(bookId, chapter, note.trim());
    }
    setShowMeditation(false);
    router.back();
  }

  const title = book
    ? `${book.name} ${chapter}장`
    : `${bookId}:${chapter}`;

  return (
    <>
      <Stack.Screen options={{ title }} />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.center}>
            <Text style={styles.loadingText}>읽는 중...</Text>
          </View>
        ) : (
          <FlatList
            data={verses}
            keyExtractor={v => String(v.verse)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.verseRow}>
                <Text style={styles.verseNum}>{item.verse}</Text>
                <Text style={styles.verseText}>{item.text}</Text>
              </View>
            )}
            ListFooterComponent={
              <Pressable
                style={[styles.completeBtn, alreadyDone && styles.doneBtnDisabled]}
                onPress={handleComplete}
                disabled={alreadyDone}
              >
                <Text style={styles.completeBtnText}>
                  {alreadyDone ? '✓ 완료됨' : '읽기 완료'}
                </Text>
              </Pressable>
            }
          />
        )}

        {/* Meditation popup */}
        <Modal visible={showMeditation} transparent animationType="slide">
          <View style={styles.overlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>오늘의 묵상</Text>
              <Text style={styles.modalSub}>한 줄이라도 남겨보세요 (선택)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="오늘 읽은 말씀에서 받은 것..."
                multiline
                maxLength={200}
                value={note}
                onChangeText={setNote}
                autoFocus
              />
              <Text style={styles.charCount}>{note.length}/200</Text>
              <View style={styles.modalActions}>
                <Pressable style={styles.skipBtn} onPress={() => { setShowMeditation(false); router.back(); }}>
                  <Text style={styles.skipBtnText}>건너뛰기</Text>
                </Pressable>
                <Pressable style={styles.saveBtn} onPress={handleSaveMeditation}>
                  <Text style={styles.saveBtnText}>저장</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#999', fontSize: 16 },
  list: { padding: 20, paddingBottom: 40 },
  verseRow: { flexDirection: 'row', marginBottom: 12, gap: 10 },
  verseNum: { fontSize: 12, color: '#999', width: 24, paddingTop: 3 },
  verseText: { fontSize: 17, lineHeight: 26, flex: 1, color: '#222' },
  completeBtn: {
    marginTop: 32,
    backgroundColor: '#4A90D9',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneBtnDisabled: { backgroundColor: '#B0C8E8' },
  completeBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  // Meditation modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  modalSub: { fontSize: 14, color: '#888', marginBottom: 16 },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: { fontSize: 12, color: '#bbb', textAlign: 'right', marginTop: 4 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  skipBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  skipBtnText: { color: '#666', fontSize: 16 },
  saveBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#4A90D9', alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

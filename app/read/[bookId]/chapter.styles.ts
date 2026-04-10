import { StyleSheet } from 'react-native';

export const HEADER_H = 44;
export const PROGRESS_H = 28;

export const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16 },

  // ── Collapsible header ────────────────────────────────────────────────────
  headerWrapper: {
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    minHeight: HEADER_H,
  },
  backBtn: {
    padding: 6,
    marginRight: 2,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    padding: 8,
  },
  ttsRateBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  ttsRateLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  ttsMenu: {
    position: 'absolute',
    right: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 160,
  },
  ttsMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ttsMenuLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  ttsMenuSection: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  ttsMenuDivider: {
    height: 1,
    marginVertical: 4,
  },

  // ── Progress strip ────────────────────────────────────────────────────────
  progressStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: PROGRESS_H,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  progressLabel: { fontSize: 11, letterSpacing: 0.3, minWidth: 48, textAlign: 'right' },

  // ── Verse rows ────────────────────────────────────────────────────────────
  list: { padding: 20, paddingBottom: 100 },
  verseRow: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  verseNum: {
    fontSize: 11,
    width: 22,
    paddingTop: 4,
    fontWeight: '700',
    opacity: 0.7,
  },
  verseText: { flex: 1 },

  // ── Complete button ───────────────────────────────────────────────────────
  completeBtn: {
    marginTop: 32,
    backgroundColor: '#D4A847',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  completeBtnPressed: { opacity: 0.85 },
  doneBtnDisabled: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(212,168,71,0.2)',
  },
  doneBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  completeBtnText: { fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  // ── Confetti ──────────────────────────────────────────────────────────────
  confettiOverlay: {
    position: 'absolute', bottom: 80, left: 0, right: 0,
    height: 0, alignItems: 'center', zIndex: 10,
  },
  particle: { position: 'absolute' },

  // ── Selection bar ─────────────────────────────────────────────────────────
  selectionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, gap: 8,
  },
  selectionLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  selectionActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  selBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
  },
  selBtnText: { fontSize: 13, fontWeight: '600' },
  selBtnCancel: { padding: 4 },

  // ── Modal shared ──────────────────────────────────────────────────────────
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  overlayInner: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 4,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
  },

  // ── Meditation modal ──────────────────────────────────────────────────────
  modal: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 44,
    borderTopWidth: 1,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  modalSub: { fontSize: 13, marginBottom: 16 },
  textInput: {
    borderWidth: 1, borderRadius: 12,
    padding: 14, fontSize: 16,
    minHeight: 100, textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  skipBtn: {
    flex: 1, padding: 15, borderRadius: 12,
    borderWidth: 1, alignItems: 'center',
  },
  skipBtnText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, fontWeight: '700' },

  // ── Settings sheet ────────────────────────────────────────────────────────
  settingsSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 48,
    borderTopWidth: 1,
  },
  settingsTitle: { fontSize: 18, fontWeight: '800', marginBottom: 20 },
  settingLabel: {
    fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: 10, marginTop: 16,
  },
  themeRow: { flexDirection: 'row', gap: 10 },
  themeSwatch: {
    flex: 1, height: 56, borderRadius: 12,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  themeSwatchLabel: { fontSize: 12, fontWeight: '700' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 36, height: 36, borderRadius: 10,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  stepValue: { fontSize: 16, fontWeight: '700', minWidth: 32, textAlign: 'center' },
  stepPreview: { flex: 1, textAlign: 'right' },
  fontRow: { flexDirection: 'row', gap: 10 },
  fontBtn: {
    flex: 1, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, alignItems: 'center',
  },
  fontBtnText: { fontSize: 14, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 20, paddingTop: 20, borderTopWidth: 1, gap: 12,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  toggleDesc: { fontSize: 12 },
});

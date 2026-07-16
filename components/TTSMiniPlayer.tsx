import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView, StyleSheet, Switch,
  Animated, PanResponder, InteractionManager, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TTS_RATE_LABELS, TTS_TIMER_PRESETS, TTSVoice } from '../hooks/useTTS';
import { useUIScale } from '../contexts/UIScaleContext';

interface Colors {
  bg: string;
  surface: string;
  border: string;
  gold: string;
  muted: string;
  text: string;
  headerBg: string;
}

interface TTSMiniPlayerProps {
  isTTS: boolean;
  isPaused: boolean;
  currentVerseText: string | null;
  ttsRateIdx: number;
  availableVoices: TTSVoice[];
  selectedVoiceId: string | null;
  timerMinutes: number | null;
  timerRemaining: number | null;
  autoCompleteEnabled: boolean;
  autoAdvanceEnabled: boolean;
  pauseEnabled: boolean;
  verseReadEnabled: boolean;
  colors: Colors;
  paddingBottom: number;
  onStop: () => void;
  onTogglePause: () => void;
  onSkip: (delta: number) => void;
  onSelectRate: (idx: number) => void;
  onSelectVoice: (id: string) => void;
  onStartTimer: (minutes: number) => void;
  onCancelTimer: () => void;
  isCdnMode?: boolean;
  isLoading?: boolean;
  isProUser: boolean;
  onUpgrade: () => void;
  onToggleAutoComplete: () => void;
  onToggleAutoAdvance: () => void;
  onTogglePauseEnabled: () => void;
  onToggleVerseRead: () => void;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Wheel Picker ──────────────────────────────────────────────────────────
const ITEM_H = 52;
const VISIBLE = 5;

interface WheelColumnProps {
  data: string[];
  initialIndex: number;
  onSelect: (index: number) => void;
  colors: Colors;
  width: number;
}

function WheelColumn({ data, initialIndex, onSelect, colors, width }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [curIdx, setCurIdx] = useState(initialIndex);
  const { fs } = useUIScale();

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: initialIndex * ITEM_H, animated: false });
    }, 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ width, height: ITEM_H * VISIBLE, overflow: 'hidden' }}>
      {/* Selection highlight */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: ITEM_H * 2,
          left: 6,
          right: 6,
          height: ITEM_H,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: `${colors.gold}55`,
          backgroundColor: `${colors.gold}10`,
          borderRadius: 10,
        }}
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
        onScroll={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
          setCurIdx(Math.max(0, Math.min(data.length - 1, idx)));
        }}
        scrollEventThrottle={16}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
          const clamped = Math.max(0, Math.min(data.length - 1, idx));
          setCurIdx(clamped);
          onSelect(clamped);
        }}
      >
        {data.map((item, i) => {
          const dist = Math.abs(i - curIdx);
          return (
            <View key={i} style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
              <Text
                style={{
                  fontSize: dist === 0 ? fs(26) : dist === 1 ? fs(20) : fs(15),
                  fontWeight: dist === 0 ? '700' : '400',
                  color: dist === 0 ? colors.text : colors.muted,
                  opacity: dist === 0 ? 1 : dist === 1 ? 0.55 : 0.2,
                }}
              >
                {item}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const HOURS_DATA = ['0', '1', '2', '3', '4'];
const MINS_DATA  = ['0', '5', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

interface TimerWheelPickerProps {
  colors: Colors;
  timerMinutes: number | null;
  onConfirm: (min: number) => void;
  onCancel: () => void;
}

function TimerWheelPicker({ colors, timerMinutes, onConfirm, onCancel }: TimerWheelPickerProps) {
  const initH = timerMinutes !== null ? Math.min(4, Math.floor(timerMinutes / 60)) : 0;
  const rawMinsRemainder = timerMinutes !== null ? timerMinutes % 60 : 30;
  const initMIdx = Math.max(0, MINS_DATA.findIndex(m => parseInt(m) === rawMinsRemainder));

  const [hIdx, setHIdx] = useState(initH);
  const [mIdx, setMIdx] = useState(initMIdx >= 0 ? initMIdx : 6);

  const totalMins = parseInt(HOURS_DATA[hIdx]) * 60 + parseInt(MINS_DATA[mIdx]);
  const isActive = timerMinutes !== null && timerMinutes === totalMins;
  const isValid = totalMins > 0;

  const colW = 80;

  return (
    <View style={wheelStyles.wrap}>
      <View style={wheelStyles.row}>
        <WheelColumn data={HOURS_DATA} initialIndex={hIdx} onSelect={setHIdx} colors={colors} width={colW} />
        <Text style={[wheelStyles.unit, { color: colors.muted }]}>시간</Text>
        <WheelColumn data={MINS_DATA} initialIndex={mIdx} onSelect={setMIdx} colors={colors} width={colW} />
        <Text style={[wheelStyles.unit, { color: colors.muted }]}>분</Text>
      </View>
      <View style={wheelStyles.actions}>
        {timerMinutes !== null && (
          <Pressable
            onPress={onCancel}
            style={[wheelStyles.cancelBtn, { borderColor: colors.border }]}
          >
            <Text style={[wheelStyles.cancelBtnText, { color: colors.muted }]}>타이머 취소</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => isValid && onConfirm(totalMins)}
          style={[
            wheelStyles.confirmBtn,
            { backgroundColor: isValid ? colors.gold : colors.border },
            timerMinutes !== null && { flex: 1 },
          ]}
        >
          <Text style={[wheelStyles.confirmBtnText, { color: isValid ? '#0B0A12' : colors.muted }]}>
            {isActive ? '다시 설정' : isValid ? `${totalMins}분 후 정지` : '시간 선택'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const wheelStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 12,
  },
  unit: {
    fontSize: 16,
    fontWeight: '500',
    width: 36,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 2,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

// ── Toggle row helper ─────────────────────────────────────────────────────
function ToggleRow({ label, desc, value, onToggle, colors }: {
  label: string;
  desc: string;
  value: boolean;
  onToggle: () => void;
  colors: Colors;
}) {
  const { fs } = useUIScale();
  return (
    <View style={[toggleStyles.row, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1, marginRight: 16 }}>
        <Text style={[toggleStyles.label, { color: colors.text, fontSize: fs(15) }]}>{label}</Text>
        <Text style={[toggleStyles.desc, { color: colors.muted, fontSize: fs(12) }]}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: `${colors.muted}30`, true: colors.gold }}
        thumbColor={value ? '#FFFFFF' : '#888'}
      />
    </View>
  );
}

const proStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

const sectionStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    gap: 8,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

const toggleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
  desc: {
    fontSize: 12,
    marginTop: 2,
  },
});

// ── Main component ────────────────────────────────────────────────────────
export function TTSMiniPlayer({
  isTTS, isPaused, currentVerseText, ttsRateIdx,
  availableVoices, selectedVoiceId, timerMinutes, timerRemaining,
  autoCompleteEnabled, autoAdvanceEnabled, pauseEnabled, verseReadEnabled,
  isCdnMode = false, isLoading = false,
  isProUser, colors, paddingBottom,
  onUpgrade, onStop, onTogglePause, onSkip, onSelectRate, onSelectVoice,
  onStartTimer, onCancelTimer,
  onToggleAutoComplete, onToggleAutoAdvance, onTogglePauseEnabled, onToggleVerseRead,
}: TTSMiniPlayerProps) {
  const { fs, is } = useUIScale();
  const [showSheet, setShowSheet] = useState(false);
  const [activePanel, setActivePanel] = useState<'voice' | 'speed' | 'timer' | null>(null);
  const closingRef = useRef(false);

  const sheetY = useRef(new Animated.Value(800)).current;

  // PanResponder only on the handle bar
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 4,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) sheetY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 70 || vy > 0.6) {
          closeSheet();
        } else {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
        }
      },
    })
  ).current;

  function openSheet() {
    closingRef.current = false;
    setShowSheet(true);
    sheetY.setValue(800);
    Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 11 }).start();
  }

  function closeSheet() {
    if (closingRef.current) return; // 중복 닫기 방지
    closingRef.current = true;
    Animated.timing(sheetY, { toValue: 800, duration: 260, useNativeDriver: true }).start(() => {
      InteractionManager.runAfterInteractions(() => {
        setShowSheet(false);
        setActivePanel(null);
        sheetY.setValue(800);
        closingRef.current = false;
      });
    });
  }

  function togglePanel(panel: 'voice' | 'speed' | 'timer') {
    setActivePanel(prev => prev === panel ? null : panel);
  }

  if (!isTTS && !isPaused) return null;

  const isPlaying = isTTS && !isPaused;

  // Short voice name for chip
  const voiceName = availableVoices.find(v => v.identifier === selectedVoiceId)?.name ?? '기본';
  const chipVoiceName = isCdnMode ? voiceName : (voiceName.length > 6 ? voiceName.slice(0, 6) : voiceName);

  return (
    <>
      {/* ── Mini bar ──────────────────────────────────────────── */}
      <Pressable
        onPress={openSheet}
        style={[
          miniStyles.bar,
          { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom },
        ]}
      >
        <Text style={[miniStyles.preview, { color: colors.muted, fontSize: fs(13) }]} numberOfLines={1}>
          {currentVerseText ?? ''}
        </Text>
        <View style={miniStyles.controls}>
          <Pressable onPress={e => { e.stopPropagation(); onSkip(-1); }} hitSlop={8} style={miniStyles.ctrlBtn}>
            <MaterialCommunityIcons name="skip-previous" size={is(22)} color={colors.muted} />
          </Pressable>
          <Pressable
            onPress={e => { e.stopPropagation(); pauseEnabled ? onTogglePause() : onStop(); }}
            style={[miniStyles.playBtn, { backgroundColor: colors.gold }]}
            hitSlop={4}
          >
            <MaterialCommunityIcons
              name={pauseEnabled ? (isPlaying ? 'pause' : 'play') : 'stop'}
              size={is(20)}
              color="#0B0A12"
            />
          </Pressable>
          <Pressable onPress={e => { e.stopPropagation(); onSkip(1); }} hitSlop={8} style={miniStyles.ctrlBtn}>
            <MaterialCommunityIcons name="skip-next" size={is(22)} color={colors.muted} />
          </Pressable>
          {timerRemaining !== null && (
            <Text style={[miniStyles.timerBadge, { color: colors.gold, fontSize: fs(12) }]}>
              {formatTime(timerRemaining)}
            </Text>
          )}
          <MaterialCommunityIcons name="chevron-up" size={is(22)} color={colors.muted} style={{ marginLeft: 4 }} />
        </View>
      </Pressable>

      {/* ── Settings sheet ────────────────────────────────────── */}
      <Modal visible={showSheet} transparent animationType="none" onRequestClose={closeSheet}>
        <Pressable style={sheetStyles.backdrop} onPress={closeSheet} />

        <Animated.View
          style={[
            sheetStyles.sheet,
            {
              backgroundColor: colors.surface,
              borderTopColor: `${colors.gold}50`,
            },
            { transform: [{ translateY: sheetY }] },
          ]}
        >
          {/* Handle — drag to close */}
          <View style={sheetStyles.handleArea} {...panResponder.panHandlers}>
            <View style={[sheetStyles.handle, { backgroundColor: colors.muted }]} />
          </View>

          {/* Verse text */}
          <Text style={[sheetStyles.verseText, { color: colors.text, fontSize: fs(16) }]} numberOfLines={2}>
            {currentVerseText ?? ''}
          </Text>

          {/* Gold accent separator */}
          <View style={[sheetStyles.accentLine, { backgroundColor: `${colors.gold}55` }]} />

          {/* Compact control row — reference image style */}
          <View style={sheetStyles.controlRow}>
            {/* Voice chip */}
            <Pressable
              onPress={() => togglePanel('voice')}
              style={({ pressed }) => [
                sheetStyles.ctrlChip,
                { borderColor: activePanel === 'voice' ? colors.gold : colors.border },
                activePanel === 'voice' && { backgroundColor: `${colors.gold}12` },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[sheetStyles.ctrlChipText, { color: activePanel === 'voice' ? colors.gold : colors.text, fontSize: fs(13) }]}>
                {chipVoiceName}
              </Text>
              <MaterialCommunityIcons
                name={activePanel === 'voice' ? 'chevron-up' : 'chevron-down'}
                size={is(13)}
                color={activePanel === 'voice' ? colors.gold : colors.muted}
              />
            </Pressable>

            {/* Speed chip */}
            <Pressable
              onPress={() => togglePanel('speed')}
              style={({ pressed }) => [
                sheetStyles.ctrlChip,
                { borderColor: activePanel === 'speed' ? colors.gold : colors.border },
                activePanel === 'speed' && { backgroundColor: `${colors.gold}12` },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[sheetStyles.ctrlChipText, { color: activePanel === 'speed' ? colors.gold : colors.text, fontSize: fs(13) }]}>
                {TTS_RATE_LABELS[ttsRateIdx]}
              </Text>
              <MaterialCommunityIcons
                name={activePanel === 'speed' ? 'chevron-up' : 'chevron-down'}
                size={is(13)}
                color={activePanel === 'speed' ? colors.gold : colors.muted}
              />
            </Pressable>

            {/* Timer chip */}
            <Pressable
              onPress={() => togglePanel('timer')}
              style={({ pressed }) => [
                sheetStyles.ctrlChip,
                {
                  borderColor: (timerRemaining !== null || activePanel === 'timer')
                    ? colors.gold : colors.border,
                },
                (timerRemaining !== null || activePanel === 'timer') && {
                  backgroundColor: `${colors.gold}12`,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <MaterialCommunityIcons
                name="timer-outline"
                size={14}
                color={timerRemaining !== null ? colors.gold : colors.muted}
              />
              {timerRemaining !== null ? (
                <Text style={[sheetStyles.ctrlChipText, { color: colors.gold }]}>
                  {formatTime(timerRemaining)}
                </Text>
              ) : (
                <>
                  <Text style={[sheetStyles.ctrlChipText, { color: activePanel === 'timer' ? colors.gold : colors.text }]}>
                    타이머
                  </Text>
                  <MaterialCommunityIcons
                    name={activePanel === 'timer' ? 'chevron-up' : 'chevron-down'}
                    size={13}
                    color={activePanel === 'timer' ? colors.gold : colors.muted}
                  />
                </>
              )}
            </Pressable>

            <View style={{ flex: 1 }} />

            {/* Stop button */}
            <Pressable
              onPress={() => { closeSheet(); setTimeout(onStop, 280); }}
              hitSlop={10}
              style={[sheetStyles.stopIconBtn, { borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="stop-circle-outline" size={18} color={colors.muted} />
            </Pressable>
          </View>

          {/* Expanded panels */}
          {activePanel === 'voice' && availableVoices.length > 0 && (
            <View style={[sheetStyles.panelBox, { borderColor: `${colors.border}` }]}>
              <View style={sheetStyles.chipRow}>
                {availableVoices.map(voice => {
                  const active = voice.identifier === selectedVoiceId;
                  return (
                    <Pressable
                      key={voice.identifier}
                      style={[
                        sheetStyles.chip,
                        { borderColor: active ? colors.gold : colors.border },
                        active && { backgroundColor: `${colors.gold}20` },
                      ]}
                      onPress={() => { onSelectVoice(voice.identifier); setActivePanel(null); }}
                    >
                      <Text style={[sheetStyles.chipText, { color: active ? colors.gold : colors.text }]}>
                        {voice.name}
                      </Text>
                      {(voice.quality === 'Enhanced' || voice.quality === 'Neural') && (
                        <View style={[sheetStyles.hdBadge, { backgroundColor: `${colors.gold}25` }]}>
                          <Text style={[sheetStyles.hdText, { color: colors.gold }]}>
                            {voice.quality === 'Neural' ? 'AI' : 'HD'}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {activePanel === 'speed' && (
            <View style={[sheetStyles.panelBox, { borderColor: colors.border }]}>
              <View style={sheetStyles.chipRow}>
                {TTS_RATE_LABELS.map((label, idx) => (
                  <Pressable
                    key={idx}
                    style={[
                      sheetStyles.chip,
                      { borderColor: idx === ttsRateIdx ? colors.gold : colors.border },
                      idx === ttsRateIdx && { backgroundColor: `${colors.gold}20` },
                    ]}
                    onPress={() => { onSelectRate(idx); setActivePanel(null); }}
                  >
                    <Text style={[sheetStyles.chipText, { color: idx === ttsRateIdx ? colors.gold : colors.text }]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {activePanel === 'timer' && (
            <View style={[sheetStyles.panelBox, { borderColor: colors.border, paddingHorizontal: 0, paddingVertical: 12 }]}>
              <TimerWheelPicker
                colors={colors}
                timerMinutes={timerMinutes}
                onConfirm={min => { onStartTimer(min); setActivePanel(null); }}
                onCancel={() => { onCancelTimer(); setActivePanel(null); }}
              />
            </View>
          )}

          {/* Large play controls — reference image layout */}
          <View style={sheetStyles.bigControls}>
            <Pressable onPress={() => onSkip(-1)} hitSlop={8} style={sheetStyles.bigCtrlBtn}>
              <MaterialCommunityIcons name="skip-previous" size={is(38)} color={colors.muted} />
            </Pressable>
            <Pressable
              onPress={isLoading ? undefined : (pauseEnabled ? onTogglePause : onStop)}
              style={[sheetStyles.bigPlayBtn, { backgroundColor: colors.gold, opacity: isLoading ? 0.6 : 1 }]}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#0B0A12" />
              ) : (
                <MaterialCommunityIcons
                  name={pauseEnabled ? (isPlaying ? 'pause' : 'play') : (isTTS ? 'stop' : 'play')}
                  size={is(34)}
                  color="#0B0A12"
                />
              )}
            </Pressable>
            <Pressable onPress={() => onSkip(1)} hitSlop={8} style={sheetStyles.bigCtrlBtn}>
              <MaterialCommunityIcons name="skip-next" size={is(38)} color={colors.muted} />
            </Pressable>
          </View>

          {/* Settings toggles */}
          <View style={[sheetStyles.divider, { backgroundColor: colors.border }]} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: paddingBottom + 8 }}>
            {/* 무료 기능 */}
            <ToggleRow
              label="자동 완료 처리"
              desc="마지막 구절 읽으면 장 완료로 표시"
              value={autoCompleteEnabled}
              onToggle={onToggleAutoComplete}
              colors={colors}
            />
            <ToggleRow
              label="일시정지 버튼"
              desc="재생 중 일시정지 사용"
              value={pauseEnabled}
              onToggle={onTogglePauseEnabled}
              colors={colors}
            />
            <ToggleRow
              label="읽은 절 읽음 처리"
              desc="TTS가 읽은 절을 자동으로 읽음 표시"
              value={verseReadEnabled}
              onToggle={onToggleVerseRead}
              colors={colors}
            />

            {/* 자동 다음 장 이동 */}
            <ToggleRow
              label="자동 다음 장 이동"
              desc="끝나면 자동으로 다음 장으로 넘어감"
              value={autoAdvanceEnabled}
              onToggle={onToggleAutoAdvance}
              colors={colors}
            />

            {/* Pro 기능 섹션 헤더 — Free 유저에게만 표시 */}
            {!isProUser && (
              <View style={[sectionStyles.header]}>
                <View style={[sectionStyles.line, { backgroundColor: colors.border }]} />
                <Text style={[sectionStyles.label, { color: colors.gold }]}>Pro 기능</Text>
                <View style={[sectionStyles.line, { backgroundColor: colors.border }]} />
              </View>
            )}

            {/* 백그라운드 재생 — Pro: 활성 중 표시 / Free: 잠금 */}
            {isProUser ? (
              <View style={[toggleStyles.row, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[toggleStyles.label, { color: colors.text }]}>백그라운드 재생</Text>
                  <Text style={[toggleStyles.desc, { color: colors.muted }]}>앱을 내려도 계속 재생됩니다</Text>
                </View>
                <MaterialCommunityIcons name="check-circle" size={18} color={colors.gold} />
              </View>
            ) : (
              <Pressable
                onPress={onUpgrade}
                style={({ pressed }) => [toggleStyles.row, { borderBottomColor: colors.border }, pressed && { opacity: 0.7 }]}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={[toggleStyles.label, { color: colors.muted }]}>백그라운드 재생</Text>
                    <View style={[proStyles.badge, { backgroundColor: `${colors.gold}18`, borderColor: `${colors.gold}50` }]}>
                      <Text style={[proStyles.badgeText, { color: colors.gold }]}>Pro</Text>
                    </View>
                  </View>
                  <Text style={[toggleStyles.desc, { color: colors.muted }]}>앱 화면 꺼도 말씀을 계속 들을 수 있어요</Text>
                </View>
                <MaterialCommunityIcons name="lock-outline" size={18} color={colors.muted} />
              </Pressable>
            )}
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const miniStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    minHeight: 56,
  },
  preview: {
    flex: 1,
    fontSize: 13,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ctrlBtn: {
    padding: 4,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerBadge: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    minWidth: 36,
    textAlign: 'right',
  },
});

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    maxHeight: '88%',
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 20,
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
  },
  verseText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    paddingHorizontal: 24,
    paddingBottom: 14,
    textAlign: 'left',
  },
  accentLine: {
    height: 1,
    marginHorizontal: 0,
    marginBottom: 12,
  },
  // Control row — reference image style
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  ctrlChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  ctrlChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  stopIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Expanded panel
  panelBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  hdBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  hdText: {
    fontSize: 9,
    fontWeight: '700',
  },
  // Large play controls
  bigControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  bigCtrlBtn: {
    padding: 4,
  },
  bigPlayBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});

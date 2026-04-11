import React, { useState } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView, StyleSheet, Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TTS_RATE_LABELS, TTS_TIMER_OPTIONS, TTSVoice } from '../hooks/useTTS';

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
  colors: Colors;
  paddingBottom: number;
  onStop: () => void;
  onTogglePause: () => void;
  onSkip: (delta: number) => void;
  onSelectRate: (idx: number) => void;
  onSelectVoice: (id: string) => void;
  onStartTimer: (minutes: number) => void;
  onCancelTimer: () => void;
  onToggleAutoComplete: () => void;
  onToggleAutoAdvance: () => void;
  onTogglePauseEnabled: () => void;
}

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TTSMiniPlayer({
  isTTS, isPaused, currentVerseText, ttsRateIdx,
  availableVoices, selectedVoiceId, timerMinutes, timerRemaining,
  autoCompleteEnabled, autoAdvanceEnabled, pauseEnabled,
  colors, paddingBottom,
  onStop, onTogglePause, onSkip, onSelectRate, onSelectVoice,
  onStartTimer, onCancelTimer,
  onToggleAutoComplete, onToggleAutoAdvance, onTogglePauseEnabled,
}: TTSMiniPlayerProps) {
  const [showSheet, setShowSheet] = useState(false);

  if (!isTTS && !isPaused) return null;

  const isPlaying = isTTS && !isPaused;

  return (
    <>
      {/* ── Mini player bar ─────────────────────────────────────── */}
      <Pressable
        style={[
          miniStyles.bar,
          { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom },
        ]}
        onPress={() => setShowSheet(true)}
      >
        {/* Verse preview */}
        <Text style={[miniStyles.preview, { color: colors.muted }]} numberOfLines={1}>
          {currentVerseText ?? ''}
        </Text>

        {/* Controls */}
        <View style={miniStyles.controls}>
          <Pressable
            onPress={e => { e.stopPropagation(); onSkip(-1); }}
            hitSlop={8}
            style={miniStyles.ctrlBtn}
          >
            <MaterialCommunityIcons name="skip-previous" size={22} color={colors.muted} />
          </Pressable>

          <Pressable
            onPress={e => { e.stopPropagation(); pauseEnabled ? onTogglePause() : onStop(); }}
            style={[miniStyles.playBtn, { backgroundColor: colors.gold }]}
            hitSlop={4}
          >
            <MaterialCommunityIcons
              name={pauseEnabled ? (isPlaying ? 'pause' : 'play') : 'stop'}
              size={20}
              color="#0B0A12"
            />
          </Pressable>

          <Pressable
            onPress={e => { e.stopPropagation(); onSkip(1); }}
            hitSlop={8}
            style={miniStyles.ctrlBtn}
          >
            <MaterialCommunityIcons name="skip-next" size={22} color={colors.muted} />
          </Pressable>

          {timerRemaining !== null && (
            <Text style={[miniStyles.timerBadge, { color: colors.gold }]}>
              {formatSeconds(timerRemaining)}
            </Text>
          )}

          <MaterialCommunityIcons name="chevron-up" size={16} color={colors.muted} style={{ marginLeft: 4 }} />
        </View>
      </Pressable>

      {/* ── Full settings sheet ─────────────────────────────────── */}
      <Modal visible={showSheet} transparent animationType="slide" onRequestClose={() => setShowSheet(false)}>
        <Pressable style={sheetStyles.backdrop} onPress={() => setShowSheet(false)} />
        <View style={[sheetStyles.sheet, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          {/* Handle */}
          <View style={sheetStyles.handleArea}>
            <View style={[sheetStyles.handle, { backgroundColor: colors.muted }]} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: paddingBottom + 16 }}>
            {/* Playback controls */}
            <View style={sheetStyles.bigControls}>
              <Text style={[sheetStyles.versePreview, { color: colors.muted }]} numberOfLines={2}>
                {currentVerseText ?? ''}
              </Text>

              <View style={sheetStyles.bigBtns}>
                <Pressable onPress={() => onSkip(-1)} hitSlop={8} style={sheetStyles.bigCtrlBtn}>
                  <MaterialCommunityIcons name="skip-previous" size={32} color={colors.muted} />
                </Pressable>

                <Pressable
                  onPress={pauseEnabled ? onTogglePause : onStop}
                  style={[sheetStyles.bigPlayBtn, { backgroundColor: colors.gold }]}
                >
                  <MaterialCommunityIcons
                    name={pauseEnabled ? (isPlaying ? 'pause' : 'play') : (isTTS ? 'stop' : 'play')}
                    size={28}
                    color="#0B0A12"
                  />
                </Pressable>

                <Pressable onPress={() => onSkip(1)} hitSlop={8} style={sheetStyles.bigCtrlBtn}>
                  <MaterialCommunityIcons name="skip-next" size={32} color={colors.muted} />
                </Pressable>
              </View>
            </View>

            <View style={[sheetStyles.divider, { backgroundColor: colors.border }]} />

            {/* Speed */}
            <Text style={[sheetStyles.sectionLabel, { color: colors.muted }]}>읽기 속도</Text>
            <View style={sheetStyles.chipRow}>
              {TTS_RATE_LABELS.map((label, idx) => (
                <Pressable
                  key={idx}
                  style={[
                    sheetStyles.chip,
                    { borderColor: colors.border },
                    idx === ttsRateIdx && { backgroundColor: `${colors.gold}20`, borderColor: colors.gold },
                  ]}
                  onPress={() => onSelectRate(idx)}
                >
                  <Text style={[sheetStyles.chipText, { color: idx === ttsRateIdx ? colors.gold : colors.text }]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Voice */}
            {availableVoices.length > 0 && (
              <>
                <View style={[sheetStyles.divider, { backgroundColor: colors.border }]} />
                <Text style={[sheetStyles.sectionLabel, { color: colors.muted }]}>목소리</Text>
                <View style={sheetStyles.chipRow}>
                  {availableVoices.map(voice => {
                    const active = voice.identifier === selectedVoiceId;
                    return (
                      <Pressable
                        key={voice.identifier}
                        style={[
                          sheetStyles.chip,
                          { borderColor: colors.border },
                          active && { backgroundColor: `${colors.gold}20`, borderColor: colors.gold },
                        ]}
                        onPress={() => onSelectVoice(voice.identifier)}
                      >
                        <Text style={[sheetStyles.chipText, { color: active ? colors.gold : colors.text }]}>
                          {voice.name}
                        </Text>
                        {voice.quality === 'Enhanced' && (
                          <View style={[sheetStyles.hdBadge, { backgroundColor: `${colors.gold}25` }]}>
                            <Text style={[sheetStyles.hdText, { color: colors.gold }]}>HD</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {/* Timer */}
            <View style={[sheetStyles.divider, { backgroundColor: colors.border }]} />
            <View style={sheetStyles.timerHeader}>
              <Text style={[sheetStyles.sectionLabel, { color: colors.muted, marginBottom: 0 }]}>슬립 타이머</Text>
              {timerRemaining !== null && (
                <View style={sheetStyles.timerBadgeRow}>
                  <Text style={[sheetStyles.timerBadgeText, { color: colors.gold }]}>
                    {formatSeconds(timerRemaining)} 남음
                  </Text>
                  <Pressable onPress={onCancelTimer} hitSlop={8} style={{ marginLeft: 8 }}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
                  </Pressable>
                </View>
              )}
            </View>
            <View style={sheetStyles.chipRow}>
              {TTS_TIMER_OPTIONS.map(min => {
                const active = timerMinutes === min;
                return (
                  <Pressable
                    key={min}
                    style={[
                      sheetStyles.chip,
                      { borderColor: colors.border },
                      active && { backgroundColor: `${colors.gold}20`, borderColor: colors.gold },
                    ]}
                    onPress={() => active ? onCancelTimer() : onStartTimer(min)}
                  >
                    <Text style={[sheetStyles.chipText, { color: active ? colors.gold : colors.text }]}>
                      {min}분
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Toggles */}
            <View style={[sheetStyles.divider, { backgroundColor: colors.border }]} />

            <View style={sheetStyles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[sheetStyles.toggleLabel, { color: colors.text }]}>자동 완료 처리</Text>
                <Text style={[sheetStyles.toggleDesc, { color: colors.muted }]}>마지막 구절 읽으면 장 완료로 표시</Text>
              </View>
              <Switch
                value={autoCompleteEnabled}
                onValueChange={onToggleAutoComplete}
                trackColor={{ true: colors.gold }}
                thumbColor="#fff"
              />
            </View>

            <View style={sheetStyles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[sheetStyles.toggleLabel, { color: colors.text }]}>자동 다음 장 이동</Text>
                <Text style={[sheetStyles.toggleDesc, { color: colors.muted }]}>끝나면 자동으로 다음 장으로 넘어감</Text>
              </View>
              <Switch
                value={autoAdvanceEnabled}
                onValueChange={onToggleAutoAdvance}
                trackColor={{ true: colors.gold }}
                thumbColor="#fff"
              />
            </View>

            <View style={sheetStyles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[sheetStyles.toggleLabel, { color: colors.text }]}>일시정지 버튼</Text>
                <Text style={[sheetStyles.toggleDesc, { color: colors.muted }]}>재생 중 일시정지 가능</Text>
              </View>
              <Switch
                value={pauseEnabled}
                onValueChange={onTogglePauseEnabled}
                trackColor={{ true: colors.gold }}
                thumbColor="#fff"
              />
            </View>

            {/* Stop button */}
            <View style={[sheetStyles.divider, { backgroundColor: colors.border }]} />
            <Pressable
              style={[sheetStyles.stopBtn, { borderColor: colors.border }]}
              onPress={() => { setShowSheet(false); onStop(); }}
            >
              <MaterialCommunityIcons name="stop-circle-outline" size={18} color={colors.muted} />
              <Text style={[sheetStyles.stopBtnText, { color: colors.muted }]}>읽기 중지</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

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
    borderTopWidth: 1,
    maxHeight: '85%',
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  bigControls: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 16,
  },
  versePreview: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  bigBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  bigCtrlBtn: {
    padding: 8,
  },
  bigPlayBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 24,
    marginVertical: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 24,
    marginTop: 12,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
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
  timerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginTop: 12,
    marginBottom: 10,
  },
  timerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 12,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  toggleDesc: {
    fontSize: 12,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  stopBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

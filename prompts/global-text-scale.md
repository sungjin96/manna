# 전체 UI 텍스트 크기 설정 기능

## 배경
manna 앱의 주 사용자층에 시력이 좋지 않은 분들이 포함됨. 현재는 읽기 화면의 본문 텍스트 크기만 조절 가능(`hooks/useReaderSettings.ts`의 `fontSize`). 앱 전체 UI(홈, 탭바, 설정, TTS 미니플레이어 등)의 텍스트/아이콘 크기를 일괄 조절하는 기능이 필요.

## 요구사항
- 설정 화면(`app/(tabs)/settings.tsx`)에 **텍스트 크기** 슬라이더 또는 4단계 선택 추가
  - 단계: 작게(0.85) / 보통(1.0) / 크게(1.15) / 아주 크게(1.3)
- 스케일 팩터가 앱 전체에 적용됨:
  - `fontSize` — 모든 Text 컴포넌트
  - `iconSize` — MaterialCommunityIcons 등
  - `padding`, `margin`, `gap` — 스케일에 비례해 조정
  - `hitSlop` — 큰 텍스트 모드에서 터치 영역도 확대
- 설정값은 `db/settings.ts`의 `app_settings` KV에 저장 (`ui_scale` 키)
- 앱 재시작 없이 즉시 반영

## 기술 방향
1. `React.createContext`로 `UIScaleContext` 생성
2. `app/_layout.tsx`에서 Provider 감싸기
3. `useUIScale()` 훅 — `{ scale, fontSize, iconSize, spacing }` 반환
4. 각 화면/컴포넌트에서 `useUIScale()` 사용해 동적 스타일 적용
5. 읽기 화면 본문은 기존 `useReaderSettings` 유지 (별도 설정)

## 영향 범위 (주요 파일)
- `app/_layout.tsx` — Provider 추가
- `app/(tabs)/settings.tsx` — 슬라이더 UI
- `app/(tabs)/index.tsx` — 홈 화면
- `app/(tabs)/progress.tsx`, `meditations.tsx`, `achievements.tsx`, `search.tsx` — 탭 화면들
- `app/(tabs)/_layout.tsx` — 탭바 라벨/아이콘
- `components/TTSMiniPlayer.tsx` — TTS UI
- `components/ReaderSettingsSheet.tsx` — 설정 시트
- `components/PaywallSheet.tsx` — 페이월
- `constants/theme.ts` — 기본 사이즈 상수 (스케일 기준값)

## 주의사항
- 읽기 화면 **본문 텍스트**는 이 스케일에 영향 받지 않음 (기존 `useReaderSettings.fontSize` 유지)
- 레이아웃이 깨지지 않도록 `maxFontSizeMultiplier` 또는 최대 스케일 제한 필요
- 탭바 높이, 헤더 높이 등 고정 레이아웃도 스케일에 맞게 조정
- UI에 이모지 사용 금지, MaterialCommunityIcons만 사용

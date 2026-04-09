# TODOS — Manna

> CEO 리뷰 2026-04-09 결과 기반. 우선순위 순서로 작업.

---

## 진행 현황

| # | 항목 | 우선순위 | 상태 |
|---|------|----------|------|
| 1 | chapter.tsx hook 추출 | P1 | ✅ 완료 |
| 2 | 읽기 알림 (Daily notification) | P1 | ✅ 완료 |
| 3 | 성경 검색 (SQLite FTS5) | P2 | ✅ 완료 |
| 4 | 통독 계획 (1년 읽기 플랜) | P2 | ✅ 완료 |
| 5 | AI 묵상 도우미 (Claude API) | P3 | ✅ 완료 |
| 6 | 크로스플랫폼 백업 | P3 | 🗓️ 보류 |

---

## P1: chapter.tsx Hook 추출

**WHY:** 현재 1000줄 단일 파일. AI 묵상 기능 추가 전에 분리 안 하면 1500줄이 된다.

**추출할 hooks:**
- `hooks/useTTS.ts` — TTS 재생/정지/속도, ttsVerse 상태
- `hooks/useMeditationSheet.ts` — 묵상 시트 open/close, 애니메이션
- `hooks/useSettingsSheet.ts` — 설정 시트 open/close, 애니메이션
- `hooks/useHeaderAnim.ts` — headerOpacity, headerHeightAnim, animateHeader, handleScroll
- `hooks/useVerseSelection.ts` — selectionMode, selectionRange, selection 로직

**완료 기준:** chapter.tsx 600줄 이하.

---

## P1: 읽기 알림

**WHY:** expo-notifications 이미 설치됨. Streak 유지율 직결. Effort S.

**구현:**
- `db/settings.ts`: `notification_enabled` (default '0'), `notification_time` (default '07:00')
- `utils/notifications.ts`: `scheduleReadingReminder(time: string)`, `cancelReadingReminder()`
- `app/(tabs)/settings.tsx`: 알림 on/off 토글 + 시간 선택 UI
- `app/_layout.tsx`: 앱 시작 시 알림 재등록

---

## P2: 성경 검색 (FTS5)

**WHY:** 성경 앱 기본 기능. SQLite FTS5 내장이라 추가 패키지 불필요.

**구현:**
- `db/schema.ts`: FTS5 virtual table `bible_fts` 초기화
- `db/bible.ts`: `searchVerses(query: string): Promise<SearchResult[]>`
- `app/(tabs)/search.tsx`: 검색 화면 (새 6번째 탭 or 진행률 탭 통합)
- `app/(tabs)/_layout.tsx`: 탭 추가

---

## P2: 통독 계획

**WHY:** 구조화된 읽기 습관. 관련 앱 인기 피치 1위.

**구현:**
- `constants/reading-plans.ts`: 맥체인(McChyne) + 연대기 플랜 데이터
- `db/reading_plans.ts`: plan 선택 저장, 오늘 할당 챕터 조회
- `app/(tabs)/settings.tsx`: 플랜 선택 UI
- `app/(tabs)/index.tsx`: "오늘의 계획" 섹션 추가

---

## P3: AI 묵상 도우미

**WHY:** YouVersion 대비 유일한 차별화. 구독 모델 피치.

**아키텍처:** 유저가 설정에서 Claude API key 입력 (초기 버전).

**구현:**
- `app/(tabs)/settings.tsx`: Claude API key 입력 필드
- `utils/ai-meditation.ts`: `generateMeditationPrompts(verses: string[], apiKey: string)`
- `db/ai_cache.ts`: 동일 절 캐싱 (API 비용 절약)
- `app/read/[bookId]/[chapter].tsx`: 절 선택 후 "AI 묵상" 버튼

**Error handling:**
- 인터넷 없음 → "오프라인 상태입니다. 직접 기록해보세요."
- API key 없음 → "설정에서 Claude API key를 입력해주세요."
- 응답 파싱 실패 → fallback 수동 묵상

---

## P3: 크로스플랫폼 백업 (보류)

**WHY:** 앱 삭제/기기 변경 시 데이터 유실.

**전략:**
- 1단계: 로컬 JSON export/import (iOS + Android 공통)
- 2단계: iOS iCloud 자동 저장 + Android Google Drive (OAuth 필요)

**보류 이유:** 2단계 복잡도 있음. RevenueCat 구독 도입 이후 결정.

---

## 아키텍처 결정 기록

| 날짜 | 결정 | 이유 |
|------|------|------|
| 2026-04-09 | 구독 없이 RevenueCat으로 IAP 처리 가능 | 계정 불필요 |
| 2026-04-09 | AI API key 유저 직접 입력 (1차) | 서버 인프라 없이 시작 |
| 2026-04-09 | 검색 = FTS5 내장 SQLite | 추가 패키지 불필요 |

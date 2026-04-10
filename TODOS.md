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
| 6 | 크로스플랫폼 백업 Phase 1 (JSON export/import) | P2 | ✅ 완료 |
| 7 | RevenueCat 구독 모델 (AI paywall) | P2 | ✅ 완료 |
| 8 | Jest 핵심 경로 테스트 추가 | P2 | ✅ 완료 |
| 9 | 온보딩 개선 (Day-7 리텐션) | P2 | ✅ 완료 |
| 10 | Privacy Policy + 앱스토어 제출 준비 | P1 | 🗓️ 보류 |
| 11 | Sentry 크래시 리포팅 | P2 | 🗓️ 보류 |
| 12 | nextAfter() 중복 제거 | P3 | 🗓️ 보류 |
| 13 | 크로스플랫폼 백업 Phase 2 (iCloud/Google Drive) | P3 | 🗓️ 보류 |
| 14 | AI 프록시 (Cloudflare Workers) — RevenueCat 전제 | P2 | ✅ 완료 |
| 15 | EAS Build 설정 + RC API 키 등록 | P1 | 🗓️ 보류 |
| 16 | RevenueCat 상품 ID 앱스토어 등록 | P1 | 🗓️ 보류 |
| 17 | 게임화 강화 (streak 보상 애니메이션) | P2 | ✅ 완료 |
| 18 | 감정 기반 말씀 추천 (AI 확장) | P2 | 🗓️ 보류 |
| 19 | 학습 레이어 / Quiz 시스템 | P3 | 🗓️ 보류 |
| 20 | Supabase 도입 (로그인/커뮤니티) | P3 | 🗓️ 보류 |

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

---

## Phase 2 항목 상세

### P2: 크로스플랫폼 백업 Phase 1 (JSON export/import)
**WHY:** 앱 삭제 시 readings/meditations/streak 전체 유실. 출시 전 기본 보호 필요.
**구현:** `utils/backup.ts` → `exportToJSON()` + `importFromJSON()`, `expo-sharing` + `expo-document-picker`, settings.tsx 섹션 추가.

### P2: RevenueCat 구독 모델
**WHY:** AI 묵상 기능이 API key 직접 입력 필요. UX 가파. 수익화 경로 필요.
**구현:** `react-native-purchases` + EAS Build, Free/Premium tier, AI 묵상 paywall.
**참고:** EAS Build 전제. App Review 1-3일 대기 필요.

### P2: Jest 핵심 경로 테스트
**WHY:** streak/reading plan 버그 리포트 대응력. 현재 getChaptersForDay, AI cache key 테스트 없음.
**대상:** `__tests__/unit/reading-plans.test.ts`, `ai-cache.test.ts`, `search.test.ts`

### P2: 온보딩 개선
**WHY:** 첫 7일 리텐션. 현재 ONBOARDING_PAGES 있지만 빈 상태 카드 UI 미흡.
**구현:** empty state 카드, 알림 권한 유도, 통독 계획 추천.

### P1: Privacy Policy + 앱스토어 제출 준비 (보류)
**WHY:** App Review 필수. Claude API key 저장 = 개인정보 수집 항목.
**구현:** GitHub Pages Privacy Policy, app.json 메타데이터, 스크린샷 5장.

### P2: Sentry 크래시 리포팅 (보류)
**WHY:** 유저 버그 리포트 전에 크래시 원인 파악.
**구현:** `expo-sentry` 설치 + DSN 설정.

### P3: nextAfter() 중복 제거 (보류)
**WHY:** `index.tsx:25`와 `chapter.tsx:39`에 동일 함수 중복.
**구현:** `utils/navigation.ts`로 추출.

### P3: 크로스플랫폼 백업 Phase 2 (보류)
**WHY:** iCloud/Google Drive 자동 동기화. OAuth 필요. 복잡도 높음.
**조건:** RevenueCat 구독 도입 + 구독자 확보 후 결정.

### P2: AI 프록시 (Cloudflare Workers) — RevenueCat 전제 (보류)
**WHY:** RevenueCat 정식 출시 시 API key UI를 제거하면 구독자가 Anthropic API를 호출할 방법이 없음. 클라이언트에 API key 번들은 보안상 불가. 서버리스 프록시 필수.
**아키텍처:** `앱 → Cloudflare Worker (RevenueCat JWT 검증) → Anthropic API`. Worker에서 entitlement 확인 후 호출.
**구현:** `utils/ai-meditation.ts`의 fetch endpoint를 Worker URL로 교체 + JWT 헤더 추가.
**조건:** RevenueCat 구현 완료 후 착수. 정식 출시 전 완료 필수.

---

## 아키텍처 결정 기록

| 날짜 | 결정 | 이유 |
|------|------|------|
| 2026-04-09 | 구독 없이 RevenueCat으로 IAP 처리 가능 | 계정 불필요 |
| 2026-04-09 | AI API key 유저 직접 입력 (1차) | 서버 인프라 없이 시작 |
| 2026-04-09 | 검색 = FTS5 내장 SQLite | 추가 패키지 불필요 |
| 2026-04-09 | AI fetch에 AbortController 15초 timeout 추가 | 무한 스피너 방지 |
| 2026-04-09 | getVariableStartIndex 결과 캐싱 | 1년 사용 시 루프 365회 방지 |
| 2026-04-09 | TTS: voice ID 동적 조회 후 사용 | language 코드로는 팩 미설치 시 무음 |
| 2026-04-10 | SQLite 유지, Supabase는 MAU 100+ 이후 검토 | 지금은 출시 집중 |
| 2026-04-10 | 앱 정체성: "AI 성경 동역자" — 읽기 메인, AI 개인화, 커뮤니티는 Phase 4+ | CEO 리뷰 결정 |

---

## Phase 3 항목 상세

### P2: AI 프록시 (Cloudflare Workers) — #14
**WHY:** RevenueCat 구독 체크와 실제 AI 호출 사이에 갭. 구독해도 API key 없으면 AI 기능 불가. 출시 전 필수.
**아키텍처:** `앱 → Worker (RevenueCat JWT) → entitlement 검증 → Anthropic API → 앱`
**구현:**
- Cloudflare Worker 생성 (wrangler 사용)
- `Purchases.getCustomerInfo()` → JWT → Worker 헤더에 포함
- Worker에서 RC REST API로 entitlement 검증
- `utils/ai-meditation.ts`의 fetch endpoint를 Worker URL로 교체
- `app/(tabs)/settings.tsx`에서 API key 입력 섹션 제거

### P2: 게임화 강화 — #17
**WHY:** "게임처럼 재미있게" 비전. 현재 streak + 업적 있지만 시각적 보상 부족.
**구현:**
- Streak 5일/30일/100일 달성 시 전용 축하 애니메이션 (Lottie 또는 React Native Animated)
- 매일 읽기 완료 시 체크마크 + 미니 피드백 애니메이션
- 홈 화면 streak 카운터 강조 (불꽃 이모지 애니메이션)

### P2: 감정 기반 말씀 추천 — #18 (Worker 완성 후)
**WHY:** "말씀이 나를 아는 경험" — 만나의 핵심 차별화. YouVersion엔 없는 기능.
**구현 옵션 A:** 오늘 기분 선택 (기뻐요/힘들어요/감사해요/불안해요 등 6종) → AI가 맞는 구절 3개 추천
**구현 옵션 B:** 이전 묵상 내용을 참고해서 "다음에 읽으면 좋을 말씀" 추천
**경계:** 일기/다이어리 앱이 되면 안 됨. 말씀이 중심, 감정은 입력값.
**전제:** Cloudflare Worker 구현 완료 후 착수.

### P3: 학습 레이어 / Quiz — #19
**WHY:** "읽고 배우는" 경험. 게임화 비전의 핵심.
**구현 아이디어:**
- 읽은 장에서 자동 생성 빈칸 채우기 (AI 활용)
- 장 완독 후 "오늘 읽은 내용 퀴즈" (3문제)
- 조간 복습 알림 ("어제 읽은 요한복음 3장 16절 기억하세요?")
**전제:** MAU 확보 후, 감정 추천 기능 완성 후 착수.

### P3: Supabase 도입 — #20
**WHY:** 크로스디바이스 동기화, 커뮤니티, 랭킹.
**조건:** MAU 100명 이상 확인 후 결정. 지금은 SQLite 유지.
**구현 시:** 기존 SQLite 스키마 → Supabase 마이그레이션 필요 (대규모 작업).

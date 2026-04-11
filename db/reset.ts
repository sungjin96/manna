import { getDb } from './schema';

/**
 * 설정 초기화 — app_settings 테이블의 모든 값을 기본값으로 복원.
 * 데이터(readings, meditations, stats 등)는 유지.
 */
export async function resetSettings(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM app_settings;
    INSERT INTO app_settings (key, value) VALUES ('notification_enabled', '0');
    INSERT INTO app_settings (key, value) VALUES ('notification_hour', '8');
    INSERT INTO app_settings (key, value) VALUES ('notification_minute', '0');
  `);
}

/**
 * 데이터 초기화 — 읽기 기록, 묵상, 통계, AI 캐시 등 모든 사용자 데이터 삭제.
 * 설정(app_settings)과 성경 본문(bible, bible_fts)은 유지.
 */
export async function resetData(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM readings;
    DELETE FROM meditations;
    DELETE FROM verse_readings;
    DELETE FROM ai_cache;
    DELETE FROM ai_daily_refresh;
    UPDATE user_stats SET current_streak = 0, longest_streak = 0, total_chapters = 0, last_read_date = NULL WHERE id = 1;
  `);
}

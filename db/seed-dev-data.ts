import { getDb } from './schema';

// 오늘 기준 N일 전 날짜 (YYYY-MM-DD)
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// 오늘 기준 N일 전 datetime (ISO 8601)
function daysAgoISO(n: number, hour = 8, minute = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export async function seedDevData(): Promise<void> {
  if (!__DEV__) return;

  const db = await getDb();

  // 이미 시드된 경우 스킵
  const existing = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM readings'
  );
  if ((existing?.count ?? 0) > 0) return;

  // 읽기 기록 — 최근 4주, 여러 책
  const readingRows: [number, number, string][] = [
    // 창세기 1~12장 (구약)
    [1, 1, daysAgo(27)], [1, 2, daysAgo(26)], [1, 3, daysAgo(25)],
    [1, 4, daysAgo(24)], [1, 5, daysAgo(23)], [1, 6, daysAgo(22)],
    [1, 7, daysAgo(20)], [1, 8, daysAgo(19)], [1, 9, daysAgo(18)],
    [1, 10, daysAgo(17)], [1, 11, daysAgo(16)], [1, 12, daysAgo(15)],
    // 시편 (19)
    [19, 1, daysAgo(14)], [19, 23, daysAgo(13)], [19, 46, daysAgo(12)],
    [19, 91, daysAgo(11)], [19, 100, daysAgo(10)],
    // 요한복음 (43)
    [43, 1, daysAgo(9)], [43, 2, daysAgo(8)], [43, 3, daysAgo(7)],
    [43, 4, daysAgo(6)], [43, 5, daysAgo(5)],
    // 잠언 (20)
    [20, 1, daysAgo(4)], [20, 2, daysAgo(3)], [20, 3, daysAgo(2)],
    [20, 4, daysAgo(1)], [20, 5, daysAgo(0)],
  ];

  for (const [book_id, chapter, completed_at] of readingRows) {
    await db.runAsync(
      'INSERT OR IGNORE INTO readings (book_id, chapter, completed_at) VALUES (?, ?, ?)',
      [book_id, chapter, completed_at]
    );
  }

  // user_stats 업데이트
  await db.runAsync(
    `INSERT OR REPLACE INTO user_stats (id, current_streak, longest_streak, total_chapters, last_read_date)
     VALUES (1, 12, 14, ?, ?)`,
    [readingRows.length, daysAgo(0)]
  );

  // 기도 그룹 2개
  const group1 = await db.runAsync(
    `INSERT INTO prayer_groups (name, order_idx, created_at) VALUES (?, 0, ?)`,
    ['가족', daysAgoISO(20)]
  );
  const group2 = await db.runAsync(
    `INSERT INTO prayer_groups (name, order_idx, created_at) VALUES (?, 1, ?)`,
    ['나라와 민족', daysAgoISO(20)]
  );
  const gid1 = group1.lastInsertRowId;
  const gid2 = group2.lastInsertRowId;

  // 기도 제목 — { type: 'prayer', content, is_answered }
  type PrayerRow = [number, number, string, string, number];
  const prayers: PrayerRow[] = [
    [1, 1,   JSON.stringify({ type: 'prayer', content: '부모님 건강 지켜주세요. 아버지 허리 수술 후 회복이 잘 되길 기도합니다.', is_answered: false }), daysAgoISO(18), gid1],
    [19, 23, JSON.stringify({ type: 'prayer', content: '동생이 취업 준비 중인데, 하나님의 인도하심이 있기를 기도합니다.', is_answered: true }),  daysAgoISO(12), gid1],
    [43, 3,  JSON.stringify({ type: 'prayer', content: '나라 지도자들에게 지혜를 주시고, 평화로운 나라가 되도록 인도해 주세요.', is_answered: false }), daysAgoISO(7),  gid2],
    [20, 3,  JSON.stringify({ type: 'prayer', content: '교회 공동체가 하나 되고, 서로 섬기는 모습으로 세워지길 기도합니다.', is_answered: false }), daysAgoISO(2),  gid2],
  ];

  for (const [book_id, chapter, note, created_at, prayer_group_id] of prayers) {
    await db.runAsync(
      `INSERT INTO meditations (book_id, chapter, note, created_at, prayer_group_id)
       VALUES (?, ?, ?, ?, ?)`,
      [book_id, chapter, note, created_at, prayer_group_id]
    );
  }

  // QnA 묵상 — { type: 'qa', entries: [{q, a}] }
  type QnARow = [number, number, string, string, number, number];
  const qnas: QnARow[] = [
    [1, 1, JSON.stringify({ type: 'qa', entries: [
      { q: '하나님이 빛을 먼저 창조하신 이유는 무엇일까?', a: '혼돈과 어둠 속에 질서를 세우시려는 하나님의 의지. 내 삶의 어둠에도 그분의 빛이 먼저 임하길.' },
      { q: '말씀으로 창조하셨다는 것이 내게 주는 의미는?', a: '그분의 말씀은 지금도 살아서 역사하신다. 오늘 읽은 말씀이 내 삶을 새롭게 빚을 것이다.' },
    ]}), daysAgoISO(25), 1, 5],
    [19, 23, JSON.stringify({ type: 'qa', entries: [
      { q: '내 삶에서 "부족함이 없다"고 느꼈던 순간은?', a: '작년 힘들 때도 결국 필요한 것들이 채워졌다. 하나님이 목자이심을 그때 경험했다.' },
      { q: '푸른 초장, 쉴 만한 물가가 내게 의미하는 것은?', a: '억지로 쉬지 않아도 자연스럽게 회복되는 곳. 말씀 묵상이 그런 공간이 되어주는 것 같다.' },
    ]}), daysAgoISO(13), 1, 6],
    [43, 3, JSON.stringify({ type: 'qa', entries: [
      { q: '"이처럼 사랑하사"에서 어떤 감정이 느껴지는가?', a: '조건 없는 사랑. 내가 무엇을 해서가 아니라 그냥 존재하기 때문에 사랑하신다는 것.' },
      { q: '영생이 단순히 죽음 이후가 아니라면?', a: '지금 여기서 하나님과 연결된 삶이 이미 영생이 아닐까. 오늘을 어떻게 살 것인가.' },
    ]}), daysAgoISO(7), 16, 17],
    [20, 3, JSON.stringify({ type: 'qa', entries: [
      { q: '내가 지금 여호와께 맡기지 못하고 있는 것은?', a: '직장 문제와 관계 갈등. 머릿속에서 혼자 해결하려 애쓰고 있었다. 오늘 내려놓기로 했다.' },
    ]}), daysAgoISO(2), 5, 6],
  ];

  for (const [book_id, chapter, note, created_at, verse_start, verse_end] of qnas) {
    await db.runAsync(
      `INSERT INTO meditations (book_id, chapter, note, created_at, verse_start, verse_end)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [book_id, chapter, note, created_at, verse_start, verse_end]
    );
  }

  // 메모 — { type: 'memo', text }
  type MemoRow = [number, number, string, string, number, number];
  const memos: MemoRow[] = [
    [19, 91, JSON.stringify({ type: 'memo', text: '그가 너를 위하여 그의 천사들을 명령하사 네 모든 길에서 너를 지키게 하심이라. 불안한 마음에 이 말씀이 꽂혔다. 나중에 다시 읽을 것.' }), daysAgoISO(10), 11, 12],
    [43, 1,  JSON.stringify({ type: 'memo', text: '태초에 말씀이 계시니라. 요한복음이 창세기 1장 1절을 의도적으로 반영한다는 것을 오늘 처음 의식했다.' }), daysAgoISO(9), 1, 1],
  ];

  for (const [book_id, chapter, note, created_at, verse_start, verse_end] of memos) {
    await db.runAsync(
      `INSERT INTO meditations (book_id, chapter, note, created_at, verse_start, verse_end)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [book_id, chapter, note, created_at, verse_start, verse_end]
    );
  }

  // 책갈피
  const bookmarks: [number, number, number, string][] = [
    [19, 23, 1, daysAgoISO(13)],
    [43, 3, 16, daysAgoISO(7)],
    [20, 3, 5, daysAgoISO(2)],
  ];
  for (const [book_id, chapter, verse, saved_at] of bookmarks) {
    await db.runAsync(
      'INSERT OR IGNORE INTO bookmarks (book_id, chapter, verse, saved_at) VALUES (?, ?, ?, ?)',
      [book_id, chapter, verse, saved_at]
    );
  }

  // 검색 히스토리 (app_settings)
  await db.runAsync(
    `INSERT OR REPLACE INTO app_settings (key, value) VALUES ('search_history', ?)`,
    [JSON.stringify(['하나님이 세상을 이처럼', '여호와는 나의 목자', '두려워하지 말라', '사랑'])]
  );
}

export async function clearDevData(): Promise<void> {
  if (!__DEV__) return;

  const db = await getDb();
  await db.execAsync(`
    DELETE FROM readings;
    DELETE FROM meditations;
    DELETE FROM prayer_groups;
    DELETE FROM bookmarks;
    DELETE FROM ai_cache;
    INSERT OR REPLACE INTO user_stats (id, current_streak, longest_streak, total_chapters, last_read_date)
      VALUES (1, 0, 0, 0, NULL);
    INSERT OR REPLACE INTO app_settings (key, value) VALUES ('search_history', '[]');
  `);
}

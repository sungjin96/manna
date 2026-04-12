import { BOOKS } from './books';

// 초보자/특정 상황에 맞는 큐레이션 챕터 목록
export const CURATED_CHAPTERS: Array<{ bookId: number; chapter: number }> = [
  { bookId: 1,  chapter: 1  }, // 창세기 1장 — 창조
  { bookId: 1,  chapter: 22 }, // 창세기 22장 — 아브라함과 이삭
  { bookId: 2,  chapter: 20 }, // 출애굽기 20장 — 십계명
  { bookId: 19, chapter: 1  }, // 시편 1편
  { bookId: 19, chapter: 23 }, // 시편 23편 — 주는 나의 목자
  { bookId: 19, chapter: 46 }, // 시편 46편 — 하나님은 우리의 피난처
  { bookId: 19, chapter: 91 }, // 시편 91편 — 전능자의 그늘 아래
  { bookId: 20, chapter: 3  }, // 잠언 3장 — 마음을 다해 주를 신뢰하라
  { bookId: 23, chapter: 40 }, // 이사야 40장 — 주는 지치지 아니하사
  { bookId: 23, chapter: 53 }, // 이사야 53장 — 고난 받는 종
  { bookId: 24, chapter: 29 }, // 예레미야 29장 — 너희에게 대한 계획
  { bookId: 40, chapter: 5  }, // 마태복음 5장 — 산상수훈
  { bookId: 40, chapter: 6  }, // 마태복음 6장 — 주기도문
  { bookId: 41, chapter: 4  }, // 마가복음 4장 — 씨 뿌리는 비유
  { bookId: 42, chapter: 15 }, // 누가복음 15장 — 잃어버린 양/돌아온 탕자
  { bookId: 43, chapter: 1  }, // 요한복음 1장 — 태초에 말씀이
  { bookId: 43, chapter: 3  }, // 요한복음 3장 — 하나님이 세상을 이처럼 사랑하사
  { bookId: 43, chapter: 15 }, // 요한복음 15장 — 나는 포도나무
  { bookId: 44, chapter: 2  }, // 사도행전 2장 — 성령 강림
  { bookId: 45, chapter: 8  }, // 로마서 8장 — 성령 안에서의 삶
  { bookId: 46, chapter: 13 }, // 고린도전서 13장 — 사랑장
  { bookId: 49, chapter: 6  }, // 에베소서 6장 — 전신갑주
  { bookId: 50, chapter: 4  }, // 빌립보서 4장 — 내게 능력 주시는 자
  { bookId: 66, chapter: 21 }, // 요한계시록 21장 — 새 하늘과 새 땅
];

/**
 * KST 기준 오늘 날짜 시드로 큐레이션 챕터를 하나 선택한다.
 * completedSet에 없는 챕터 중에서 선택. 모두 읽었으면 전체 풀로 fallback.
 */
export function getTodayRecommendation(
  completedSet: Set<string>
): { bookId: number; chapter: number } | null {
  if (CURATED_CHAPTERS.length === 0) return null;

  // KST 날짜 시드
  const d = new Date();
  d.setHours(d.getHours() + 9); // UTC → KST
  const seed = Math.floor(d.getTime() / 86400000);

  const unread = CURATED_CHAPTERS.filter(
    c => !completedSet.has(`${c.bookId}:${c.chapter}`)
  );
  const pool = unread.length > 0 ? unread : CURATED_CHAPTERS;

  return pool[seed % pool.length];
}

/**
 * 전체 1189챕터 중 랜덤 챕터. 직전 챕터와 동일하면 1회 재시도.
 */
export function getRandomChapter(
  exclude?: { bookId: number; chapter: number }
): { bookId: number; chapter: number } {
  function pick(): { bookId: number; chapter: number } {
    const total = BOOKS.reduce((sum, b) => sum + b.chapters, 0);
    let idx = Math.floor(Math.random() * total);
    for (const book of BOOKS) {
      if (idx < book.chapters) return { bookId: book.id, chapter: idx + 1 };
      idx -= book.chapters;
    }
    return { bookId: 1, chapter: 1 };
  }

  const result = pick();
  if (
    exclude &&
    result.bookId === exclude.bookId &&
    result.chapter === exclude.chapter
  ) {
    return pick(); // 1회 재시도
  }
  return result;
}

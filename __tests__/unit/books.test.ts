import { BOOKS, TOTAL_CHAPTERS } from '../../constants/books';

describe('BOOKS', () => {
  test('66권', () => {
    expect(BOOKS).toHaveLength(66);
  });

  test('구약 39권, 신약 27권', () => {
    const old = BOOKS.filter(b => b.testament === 'old');
    const newT = BOOKS.filter(b => b.testament === 'new');
    expect(old).toHaveLength(39);
    expect(newT).toHaveLength(27);
  });

  test('id는 1-66 연속', () => {
    BOOKS.forEach((b, i) => expect(b.id).toBe(i + 1));
  });

  test('TOTAL_CHAPTERS = 1,189', () => {
    expect(TOTAL_CHAPTERS).toBe(1189);
  });

  test('시편 150장', () => {
    const psalms = BOOKS.find(b => b.nameEn === 'Psalms');
    expect(psalms?.chapters).toBe(150);
  });
});

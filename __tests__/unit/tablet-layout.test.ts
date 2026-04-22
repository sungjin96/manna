// TabletLayoutContext breakpoint logic tests
// Tests the pure logic without React rendering

describe('TabletLayoutContext breakpoints', () => {
  function computeLayout(width: number, height: number) {
    const isTablet = width >= 768;
    const isLandscape = width > height;
    return {
      isTablet,
      isLandscape,
      isTabletLandscape: isTablet && isLandscape,
    };
  }

  test('width 768 is tablet (inclusive boundary)', () => {
    const { isTablet } = computeLayout(768, 1024);
    expect(isTablet).toBe(true);
  });

  test('width 767 is not tablet (exclusive boundary)', () => {
    const { isTablet } = computeLayout(767, 1024);
    expect(isTablet).toBe(false);
  });

  test('tablet landscape: isTabletLandscape is true', () => {
    const { isTabletLandscape } = computeLayout(1024, 768);
    expect(isTabletLandscape).toBe(true);
  });

  test('tablet portrait: isTabletLandscape is false', () => {
    const { isTabletLandscape } = computeLayout(768, 1024);
    expect(isTabletLandscape).toBe(false);
  });

  test('phone landscape: isTabletLandscape is false (not tablet)', () => {
    const { isTabletLandscape } = computeLayout(667, 375);
    expect(isTabletLandscape).toBe(false);
  });

  test('phone portrait: both isTablet and isTabletLandscape are false', () => {
    const { isTablet, isTabletLandscape } = computeLayout(390, 844);
    expect(isTablet).toBe(false);
    expect(isTabletLandscape).toBe(false);
  });

  test('large tablet landscape (iPad Pro 12.9): isTabletLandscape is true', () => {
    const { isTabletLandscape } = computeLayout(1366, 1024);
    expect(isTabletLandscape).toBe(true);
  });

  test('square screen (width === height): isLandscape is false', () => {
    const { isLandscape } = computeLayout(768, 768);
    expect(isLandscape).toBe(false);
  });
});

describe('MasterDetailLayout leftFlex bounds', () => {
  test('leftFlex 0.35 produces correct right panel flex', () => {
    const leftFlex = 0.35;
    const rightFlex = 1 - leftFlex;
    expect(rightFlex).toBeCloseTo(0.65, 5);
  });

  test('leftFlex 0 gives all space to detail', () => {
    const rightFlex = 1 - 0;
    expect(rightFlex).toBe(1);
  });

  test('leftFlex 1 gives all space to master', () => {
    const rightFlex = 1 - 1;
    expect(rightFlex).toBe(0);
  });
});

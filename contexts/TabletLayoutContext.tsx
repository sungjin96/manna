import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

interface TabletLayoutContextValue {
  isTablet: boolean;
  isLandscape: boolean;
  isTabletLandscape: boolean;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const TabletLayoutContext = createContext<TabletLayoutContextValue>({
  isTablet: false,
  isLandscape: false,
  isTabletLandscape: false,
  isDrawerOpen: false,
  openDrawer: () => {},
  closeDrawer: () => {},
});

export function TabletLayoutProvider({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isTablet = width >= 768;
  const isLandscape = width > height;
  const isTabletLandscape = isTablet && isLandscape;

  useEffect(() => {
    if (isLandscape) setIsDrawerOpen(false);
  }, [isLandscape]);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  const value = useMemo(
    () => ({ isTablet, isLandscape, isTabletLandscape, isDrawerOpen, openDrawer, closeDrawer }),
    [isTablet, isLandscape, isTabletLandscape, isDrawerOpen, openDrawer, closeDrawer],
  );

  return <TabletLayoutContext.Provider value={value}>{children}</TabletLayoutContext.Provider>;
}

export function useTabletLayout() {
  return useContext(TabletLayoutContext);
}

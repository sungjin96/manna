import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSetting, setSetting } from '../db/settings';

export const UI_SCALE_OPTIONS = [
  { label: '작게', value: 0.85 },
  { label: '보통', value: 1.0 },
  { label: '크게', value: 1.15 },
  { label: '아주 크게', value: 1.3 },
] as const;

export type UIScaleValue = (typeof UI_SCALE_OPTIONS)[number]['value'];

interface UIScaleContextValue {
  scale: UIScaleValue;
  setScale: (scale: UIScaleValue) => Promise<void>;
  /** 폰트 크기에 스케일 적용 */
  fs: (base: number) => number;
  /** 아이콘 크기에 스케일 적용 */
  is: (base: number) => number;
  /** 간격(padding/margin/gap)에 스케일 적용 */
  sp: (base: number) => number;
}

const UIScaleContext = createContext<UIScaleContextValue>({
  scale: 1.0,
  setScale: async () => {},
  fs: (b) => b,
  is: (b) => b,
  sp: (b) => b,
});

export function UIScaleProvider({ children }: { children: React.ReactNode }) {
  const [scale, setScaleState] = useState<UIScaleValue>(1.0);

  useEffect(() => {
    getSetting('ui_scale', '1.0').then((val) => {
      const parsed = parseFloat(val) as UIScaleValue;
      const valid = UI_SCALE_OPTIONS.some((o) => o.value === parsed);
      if (valid) setScaleState(parsed);
    });
  }, []);

  async function setScale(newScale: UIScaleValue) {
    setScaleState(newScale);
    await setSetting('ui_scale', String(newScale));
  }

  const value = useMemo<UIScaleContextValue>(
    () => ({
      scale,
      setScale,
      fs: (base) => Math.round(base * scale),
      is: (base) => Math.round(base * scale),
      sp: (base) => Math.round(base * scale),
    }),
    [scale],
  );

  return <UIScaleContext.Provider value={value}>{children}</UIScaleContext.Provider>;
}

export function useUIScale() {
  return useContext(UIScaleContext);
}

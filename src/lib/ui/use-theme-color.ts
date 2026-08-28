'use client';

import { useEffect, useState } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { readCssVar, toThreeColor } from './css-var';

/**
 * A design token, resolved for the active theme and kept in sync with it.
 *
 * The 3D viewers set their scene background from JS, and it was hardcoded
 * (`#0b1013`, `#0f172a`), so the canvas stayed near-black in light mode — a
 * dark hole in the middle of an otherwise light page. Reading the token once at
 * module scope would not fix it either, since the value has to change when the
 * user toggles the theme.
 *
 * Resolution happens in an effect so the stylesheet has applied; until then the
 * SSR-safe fallback is returned, which avoids a hydration mismatch.
 *
 * @param name Custom property name, including the leading `--`.
 * @param fallback Value used before resolution and when the token is unset.
 */
export function useThemeColor(name: string, fallback?: string): string {
  const theme = useUIStore((s) => s.theme);
  const [color, setColor] = useState(() => readCssVar(name, fallback));

  useEffect(() => {
    setColor(toThreeColor(readCssVar(name, fallback), fallback));
  }, [name, fallback, theme]);

  return color;
}

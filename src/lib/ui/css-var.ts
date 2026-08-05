/**
 * Read design tokens from the cascade for consumers that cannot use CSS.
 *
 * Three.js materials, `<color attach="background">` and canvas 2D contexts all
 * take colour values in JS, so they were given hardcoded hex — which meant they
 * never responded to the theme. The most visible symptom: the 3D viewers paint
 * a near-black background in both themes, so light mode has a dark hole in the
 * middle of the page.
 *
 * Values are resolved from the document element, so they follow whatever
 * `data-theme` is set to. Read them inside an effect (or on a theme change),
 * never at module scope — at import time the stylesheet may not have applied
 * and every caller would cache the fallback forever.
 */

/** SSR-safe fallbacks, used when there is no document or the token is unset. */
const FALLBACKS: Record<string, string> = {
  '--background': '#0e171f',
  '--foreground': '#e6eef5',
  '--card': '#1a232a',
  '--border': '#262e35',
  '--muted-foreground': '#a3b5c7',
  '--accent': '#2bb89d',
  '--primary': '#5b8fc7',
};

/**
 * Resolve a CSS custom property to a concrete colour string.
 *
 * @param name Custom property name, including the leading `--`.
 * @param fallback Used when running without a document, or when the property
 *   resolves to nothing. Defaults to a known dark-theme value where one exists.
 */
export function readCssVar(name: string, fallback?: string): string {
  const fb = fallback ?? FALLBACKS[name] ?? '#000000';
  if (typeof document === 'undefined') return fb;

  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  return raw || fb;
}

/** Resolve several tokens at once. */
export function readCssVars<K extends string>(
  names: readonly K[],
): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const n of names) out[n] = readCssVar(n);
  return out;
}

/**
 * Three.js colour parsing does not understand `oklch()`, `color-mix()` or
 * whitespace-separated `rgb()`, which is what a browser may hand back for a
 * token. Convert to a form it always accepts.
 *
 * Returns the input unchanged when it is already a hex value.
 */
export function toThreeColor(value: string, fallback = '#000000'): string {
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;

  const nums = v.match(/-?[\d.]+%?/g);
  if (!nums || nums.length < 3) return fallback;

  // rgb()/rgba() in either comma or space syntax.
  if (/^rgba?\(/i.test(v)) {
    const [r, g, b] = nums.slice(0, 3).map((n) =>
      n.endsWith('%')
        ? Math.round((parseFloat(n) / 100) * 255)
        : Math.round(parseFloat(n)),
    );
    if ([r, g, b].some((c) => !Number.isFinite(c))) return fallback;
    return (
      '#' +
      [r, g, b]
        .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0'))
        .join('')
    );
  }

  return fallback;
}

// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { readCssVar, readCssVars, toThreeColor } from '../css-var';

/**
 * Token resolution for consumers that take colours in JS.
 *
 * Three.js materials, `<color attach="background">` and canvas 2D contexts
 * cannot use CSS, so they were given hardcoded hex and never followed the
 * theme. The visible symptom was the 3D viewers painting a near-black
 * background in light mode — a dark hole in the middle of the page.
 *
 * The fallback behaviour is the part worth pinning: these run during SSR and
 * before the stylesheet applies, and a wrong fallback is exactly the bug being
 * fixed.
 */

afterEach(() => {
  document.documentElement.style.cssText = '';
});

describe('readCssVar', () => {
  it('resolves a token set on the document element', () => {
    document.documentElement.style.setProperty('--canvas-bg', '#123456');
    expect(readCssVar('--canvas-bg')).toBe('#123456');
  });

  it('follows the theme, since it reads the live cascade', () => {
    document.documentElement.style.setProperty('--canvas-bg', '#0b1013');
    expect(readCssVar('--canvas-bg')).toBe('#0b1013');

    // What a theme switch amounts to for this reader.
    document.documentElement.style.setProperty('--canvas-bg', '#e6eaee');
    expect(readCssVar('--canvas-bg')).toBe('#e6eaee');
  });

  it('uses the supplied fallback when the token is unset', () => {
    expect(readCssVar('--not-a-token', '#abcdef')).toBe('#abcdef');
  });

  it('trims whitespace the browser may return', () => {
    document.documentElement.style.setProperty('--canvas-bg', '  #ff0000  ');
    expect(readCssVar('--canvas-bg')).toBe('#ff0000');
  });

  it('reads several tokens at once', () => {
    document.documentElement.style.setProperty('--accent', '#148673');
    document.documentElement.style.setProperty('--border', '#dbdee0');
    expect(readCssVars(['--accent', '--border'])).toEqual({
      '--accent': '#148673',
      '--border': '#dbdee0',
    });
  });
});

describe('toThreeColor', () => {
  it('passes hex through untouched', () => {
    expect(toThreeColor('#0b1013')).toBe('#0b1013');
    expect(toThreeColor('#abc')).toBe('#abc');
  });

  it('converts comma-syntax rgb()', () => {
    expect(toThreeColor('rgb(11, 16, 19)')).toBe('#0b1013');
  });

  it('converts space-syntax rgb(), which is what browsers often return', () => {
    expect(toThreeColor('rgb(11 16 19)')).toBe('#0b1013');
  });

  it('converts rgba() by dropping alpha, which a scene background cannot use', () => {
    expect(toThreeColor('rgba(11, 16, 19, 0.5)')).toBe('#0b1013');
  });

  it('converts percentage channels', () => {
    expect(toThreeColor('rgb(100%, 0%, 0%)')).toBe('#ff0000');
  });

  it('falls back rather than emitting something three.js cannot parse', () => {
    // oklch()/color-mix() are valid CSS the token layer uses, and three.js
    // throws on them. A wrong-but-parseable colour beats a crash.
    expect(toThreeColor('oklch(0.7 0.1 200)', '#0b1013')).toBe('#0b1013');
    expect(toThreeColor('color-mix(in oklab, red, blue)', '#0b1013')).toBe('#0b1013');
    expect(toThreeColor('', '#0b1013')).toBe('#0b1013');
  });
});

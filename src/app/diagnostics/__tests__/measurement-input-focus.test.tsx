// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';

/**
 * Regression test for the diagnostics measurement inputs losing focus.
 *
 * Pill and NumField used to be declared inside DiagnosticsPage, so every render
 * produced brand-new component types. React cannot reconcile a changed type, so
 * it unmounted and remounted the subtree — and since each keystroke re-renders
 * the page, the <input> was destroyed mid-typing and focus went to <body>. In
 * practice you could only ever type one character.
 *
 * The fix was hoisting both to module scope. This asserts the user-visible
 * consequence (focus survives typing, and the value accumulates) rather than
 * the structural detail, so it stays honest if the components are refactored
 * again.
 */

const authFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ authFetch }));
vi.mock('@/components/ui/toast', () => ({ showToast: vi.fn() }));

import DiagnosticsPage from '../page';

beforeEach(() => {
  authFetch.mockReset();
  authFetch.mockImplementation(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ projects: [] }) }),
  );
});

afterEach(() => {
  // vitest runs globals:false, so testing-library's auto-cleanup is not registered.
  cleanup();
  vi.clearAllMocks();
});

async function openMeasurements() {
  render(<DiagnosticsPage />);
  await act(async () => { await Promise.resolve(); });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Field Measurements/i }));
  });
}

describe('diagnostics measurement inputs', () => {
  it('keeps focus while typing a multi-character value', async () => {
    await openMeasurements();

    const input = screen.getByLabelText(/Supply \(cold\)/i) as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    // Digits only. An intermediate value like "14." is not a valid
    // floating-point string, so <input type="number"> normalises it to "" and
    // the controlled re-render blanks the field. Real browsers keep the
    // half-typed text on screen; jsdom does not. That difference is about the
    // number input, not about the remounting bug under test, so avoid it.
    for (const digit of ['1', '4', '5']) {
      await act(async () => {
        fireEvent.change(input, { target: { value: input.value + digit } });
      });
      expect(document.activeElement).toBe(
        screen.getByLabelText(/Supply \(cold\)/i),
      );
    }

    expect((screen.getByLabelText(/Supply \(cold\)/i) as HTMLInputElement).value).toBe('145');
  });

  it('keeps the same DOM node across renders (no remount)', async () => {
    await openMeasurements();

    const before = screen.getByLabelText(/Supply \(cold\)/i);
    await act(async () => {
      fireEvent.change(before, { target: { value: '20' } });
    });
    const after = screen.getByLabelText(/Supply \(cold\)/i);

    // A remount would hand back a different element instance.
    expect(after).toBe(before);
  });

  it('toggles a symptom pill without disturbing the measurement input', async () => {
    await openMeasurements();

    const input = screen.getByLabelText(/Outdoor/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: '35' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Weak Airflow/i }));
    });

    expect((screen.getByLabelText(/Outdoor/i) as HTMLInputElement).value).toBe('35');
  });
});

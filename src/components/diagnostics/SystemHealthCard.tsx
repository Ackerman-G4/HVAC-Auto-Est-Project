'use client';

/**
 * System Health board (overhaul-v3 Phase 7.2).
 * A quick, self-contained health panel for the diagnostics page:
 *  - Backend connectivity + latency (authed ping),
 *  - Engine self-test — runs the pure calculation engines in-browser and
 *    asserts they still produce sane output (the money path can't silently rot),
 *  - Browser/session online status.
 * Everything runs client-side; no new API surface.
 */
import { useCallback, useEffect, useState } from 'react';
import { Activity, Check, Loader2, RefreshCcw, TriangleAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { authFetch } from '@/lib/api-client';
import {
  calculateEquipmentSelection,
  defaultEquipmentSelectionInputs,
  defaultEquipmentSelectionOverrides,
} from '@/lib/engine/hvac/equipment-selection-engine';
import {
  calculateAirflowScenario,
  defaultAirflowInputs,
  defaultAirflowOverrides,
} from '@/lib/engine/hvac/airflow-duct-engine';

type CheckState = 'pending' | 'ok' | 'fail';

interface CheckRow {
  key: string;
  label: string;
  state: CheckState;
  detail: string;
}

const INITIAL: CheckRow[] = [
  { key: 'backend', label: 'Backend connectivity', state: 'pending', detail: '' },
  { key: 'engine', label: 'Calculation engine self-test', state: 'pending', detail: '' },
  { key: 'browser', label: 'Browser session', state: 'pending', detail: '' },
];

function runEngineSelfTest(): { ok: boolean; detail: string } {
  try {
    const eq = calculateEquipmentSelection(defaultEquipmentSelectionInputs, defaultEquipmentSelectionOverrides);
    const air = calculateAirflowScenario(defaultAirflowInputs, defaultAirflowOverrides);
    const eqOk = eq.candidates.length > 0 && eq.candidates.every((c) => c.providedTr > 0);
    const airOk = air.branchRows.length > 0 && air.requiredFanPowerHp > 0;
    if (eqOk && airOk) {
      return { ok: true, detail: `${eq.candidates.length} candidates, ${air.branchRows.length} branches` };
    }
    return { ok: false, detail: 'engine returned degenerate output' };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'engine threw' };
  }
}

export function SystemHealthCard() {
  const [rows, setRows] = useState<CheckRow[]>(INITIAL);
  const [running, setRunning] = useState(false);

  const runChecks = useCallback(async () => {
    setRunning(true);
    setRows(INITIAL);

    // Browser session
    setRows((r) => r.map((row) => row.key === 'browser'
      ? { ...row, state: navigator.onLine ? 'ok' : 'fail', detail: navigator.onLine ? 'online' : 'offline' }
      : row));

    // Engine self-test (synchronous, pure)
    const engine = runEngineSelfTest();
    setRows((r) => r.map((row) => row.key === 'engine'
      ? { ...row, state: engine.ok ? 'ok' : 'fail', detail: engine.detail }
      : row));

    // Backend connectivity + latency
    const started = performance.now();
    try {
      const res = await authFetch('/api/diagnostics/history?limit=1');
      const ms = Math.round(performance.now() - started);
      setRows((r) => r.map((row) => row.key === 'backend'
        ? { ...row, state: res.ok ? 'ok' : 'fail', detail: res.ok ? `${ms} ms` : `HTTP ${res.status}` }
        : row));
    } catch {
      setRows((r) => r.map((row) => row.key === 'backend'
        ? { ...row, state: 'fail', detail: 'unreachable' }
        : row));
    }

    setRunning(false);
  }, []);

  useEffect(() => {
    // Defer out of the effect body so the initial state updates are not applied
    // synchronously during render/effect.
    const t = window.setTimeout(() => void runChecks(), 0);
    return () => window.clearTimeout(t);
  }, [runChecks]);

  const allOk = rows.every((r) => r.state === 'ok');
  const anyFail = rows.some((r) => r.state === 'fail');

  return (
    <Card className="panel-glass border-border/70 bg-card shadow-sm">
      <CardContent className="px-5 py-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-foreground">System Health</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                anyFail ? 'bg-destructive/15 text-destructive'
                  : allOk ? 'bg-accent/15 text-accent'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              {anyFail ? 'Attention' : allOk ? 'Healthy' : 'Checking'}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void runChecks()} isLoading={running}>
            <RefreshCcw className="mr-1 h-3.5 w-3.5" /> Re-run
          </Button>
        </div>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 rounded-sm border border-border bg-secondary/40 px-3.5 py-2.5">
              <span className="flex items-center gap-2 text-sm text-foreground">
                {row.state === 'pending' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {row.state === 'ok' && <Check className="h-3.5 w-3.5 text-accent" />}
                {row.state === 'fail' && <TriangleAlert className="h-3.5 w-3.5 text-destructive" />}
                {row.label}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">{row.detail}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

'use client';

/**
 * PsychrometricChart — Interactive ASHRAE-style psychrometric chart
 *
 * Features:
 * - Saturation curve (100% RH)
 * - Constant RH curves (20%, 40%, 60%, 80%)
 * - Constant wet-bulb lines
 * - Constant enthalpy lines
 * - ASHRAE 55 comfort zone overlay
 * - Live state point plotting with tooltips
 * - Process lines between state points
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  saturationPressure,
  humidityRatio,
  wetBulb as calcWetBulb,
  enthalpy as calcEnthalpy,
  psychrometricState,
  type PsychrometricState,
} from '@/lib/functions/psychrometric';
import { getRuleSetSync } from '@/lib/engine/rules';
import { constantFromRuleSet } from '@/lib/engine/rules/rule-evaluator';

// ─── Types ──────────────────────────────────────────────────────────

export interface StatePoint {
  label: string;
  temp: number;  // dry-bulb °C
  rh: number;    // relative humidity 0-100
  color?: string;
}

export interface ProcessLine {
  from: string; // label of start point
  to: string;   // label of end point
  type: 'sensible' | 'latent' | 'mixed' | 'cooling' | 'heating';
}

interface ChartProps {
  points?: StatePoint[];
  processLines?: ProcessLine[];
  showComfortZone?: boolean;
  width?: number;
  height?: number;
  minTemp?: number;
  maxTemp?: number;
}

// ─── Chart Geometry ─────────────────────────────────────────────────

const PADDING = { top: 30, right: 60, bottom: 50, left: 60 };
const P_ATM = 101325;

// Comfort zone from rules
function getComfortBounds() {
  try {
    const rules = getRuleSetSync('psychrometric');
    return {
      minDb: constantFromRuleSet(rules, 'comfort_zone', 'min_db'),
      maxDb: constantFromRuleSet(rules, 'comfort_zone', 'max_db'),
      minRh: constantFromRuleSet(rules, 'comfort_zone', 'min_rh'),
      maxRh: constantFromRuleSet(rules, 'comfort_zone', 'max_rh'),
    };
  } catch {
    return { minDb: 20, maxDb: 26, minRh: 30, maxRh: 60 };
  }
}

// ─── Drawing Helpers ────────────────────────────────────────────────

function tempToX(temp: number, minT: number, maxT: number, plotW: number): number {
  return PADDING.left + ((temp - minT) / (maxT - minT)) * plotW;
}

function wToY(w: number, maxW: number, plotH: number): number {
  return PADDING.top + plotH - (w / maxW) * plotH;
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, opts?: {
  align?: CanvasTextAlign; baseline?: CanvasTextBaseline; color?: string; size?: number;
}) {
  ctx.save();
  ctx.fillStyle = opts?.color ?? '#64748b';
  ctx.font = `${opts?.size ?? 10}px ui-monospace, monospace`;
  ctx.textAlign = opts?.align ?? 'center';
  ctx.textBaseline = opts?.baseline ?? 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ─── Main Component ─────────────────────────────────────────────────

export default function PsychrometricChart({
  points = [],
  processLines = [],
  showComfortZone = true,
  width = 720,
  height = 460,
  minTemp = 0,
  maxTemp = 50,
}: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredState, setHoveredState] = useState<PsychrometricState | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const plotW = width - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;
  const maxW = humidityRatio(maxTemp, 100, P_ATM) * 1.1; // max humidity ratio on chart

  const xToTemp = useCallback((x: number) => minTemp + ((x - PADDING.left) / plotW) * (maxTemp - minTemp), [minTemp, maxTemp, plotW]);
  const yToW = useCallback((y: number) => ((PADDING.top + plotH - y) / plotH) * maxW, [plotH, maxW]);

  // ─── Canvas Drawing ─────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    for (let t = minTemp; t <= maxTemp; t += 5) {
      const x = tempToX(t, minTemp, maxTemp, plotW);
      ctx.beginPath(); ctx.moveTo(x, PADDING.top); ctx.lineTo(x, PADDING.top + plotH); ctx.stroke();
    }
    for (let w = 0; w <= maxW; w += 0.002) {
      const y = wToY(w, maxW, plotH);
      ctx.beginPath(); ctx.moveTo(PADDING.left, y); ctx.lineTo(PADDING.left + plotW, y); ctx.stroke();
    }

    // ─── ASHRAE 55 Comfort Zone ───────────────────────────────
    if (showComfortZone) {
      const cz = getComfortBounds();
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      // Trace comfort zone polygon
      for (let t = cz.minDb; t <= cz.maxDb; t += 0.5) {
        const w = humidityRatio(t, cz.maxRh, P_ATM);
        const x = tempToX(t, minTemp, maxTemp, plotW);
        const y = wToY(w, maxW, plotH);
        if (t === cz.minDb) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (let t = cz.maxDb; t >= cz.minDb; t -= 0.5) {
        const w = humidityRatio(t, cz.minRh, P_ATM);
        const x = tempToX(t, minTemp, maxTemp, plotW);
        const y = wToY(w, maxW, plotH);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, 'Comfort Zone', tempToX((cz.minDb + cz.maxDb) / 2, minTemp, maxTemp, plotW), wToY(humidityRatio((cz.minDb + cz.maxDb) / 2, (cz.minRh + cz.maxRh) / 2, P_ATM), maxW, plotH) - 8, { color: '#22c55e', size: 9 });
    }

    // ─── Constant RH Curves ───────────────────────────────────
    const rhCurves = [20, 40, 60, 80, 100];
    for (const rh of rhCurves) {
      ctx.strokeStyle = rh === 100 ? '#3b82f6' : '#334155';
      ctx.lineWidth = rh === 100 ? 2 : 1;
      ctx.beginPath();
      let started = false;
      for (let t = minTemp; t <= maxTemp; t += 0.5) {
        const w = humidityRatio(t, rh, P_ATM);
        if (w > maxW) continue;
        const x = tempToX(t, minTemp, maxTemp, plotW);
        const y = wToY(w, maxW, plotH);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Label
      const labelT = rh === 100 ? maxTemp - 3 : Math.min(maxTemp - 2, 35 + (100 - rh) * 0.2);
      const labelW = humidityRatio(labelT, rh, P_ATM);
      if (labelW <= maxW) {
        drawText(ctx, `${rh}%`, tempToX(labelT, minTemp, maxTemp, plotW) + 2, wToY(labelW, maxW, plotH) - 6, { color: rh === 100 ? '#3b82f6' : '#475569', size: 9 });
      }
    }

    // ─── Constant Enthalpy Lines ──────────────────────────────
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#7c3aed30';
    ctx.lineWidth = 0.8;
    for (let h = 10; h <= 120; h += 10) {
      ctx.beginPath();
      let started = false;
      for (let t = minTemp; t <= maxTemp; t += 1) {
        // h = 1.006*t + w*(2501 + 1.86*t)  →  w = (h - 1.006*t) / (2501 + 1.86*t)
        const wLine = (h - 1.006 * t) / (2501 + 1.86 * t);
        if (wLine < 0 || wLine > maxW) continue;
        // Check if this w is achievable (below saturation)
        const wSat = humidityRatio(t, 100, P_ATM);
        if (wLine > wSat) continue;
        const x = tempToX(t, minTemp, maxTemp, plotW);
        const y = wToY(wLine, maxW, plotH);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // ─── Axes ─────────────────────────────────────────────────
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, PADDING.top);
    ctx.lineTo(PADDING.left, PADDING.top + plotH);
    ctx.lineTo(PADDING.left + plotW, PADDING.top + plotH);
    ctx.stroke();

    // X-axis labels (dry-bulb)
    for (let t = minTemp; t <= maxTemp; t += 5) {
      const x = tempToX(t, minTemp, maxTemp, plotW);
      drawText(ctx, `${t}`, x, PADDING.top + plotH + 14);
    }
    drawText(ctx, 'Dry-Bulb Temperature (°C)', PADDING.left + plotW / 2, height - 10, { size: 11, color: '#94a3b8' });

    // Y-axis labels (humidity ratio)
    for (let w = 0; w <= maxW; w += 0.005) {
      const y = wToY(w, maxW, plotH);
      drawText(ctx, (w * 1000).toFixed(1), PADDING.left - 24, y, { align: 'right', size: 9 });
    }
    ctx.save();
    ctx.translate(12, PADDING.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    drawText(ctx, 'Humidity Ratio (g/kg)', 0, 0, { size: 11, color: '#94a3b8' });
    ctx.restore();

    // ─── Process Lines ────────────────────────────────────────
    if (processLines.length > 0 && points.length >= 2) {
      for (const line of processLines) {
        const fromPt = points.find(p => p.label === line.from);
        const toPt = points.find(p => p.label === line.to);
        if (!fromPt || !toPt) continue;

        const fromW = humidityRatio(fromPt.temp, fromPt.rh, P_ATM);
        const toW = humidityRatio(toPt.temp, toPt.rh, P_ATM);
        const x1 = tempToX(fromPt.temp, minTemp, maxTemp, plotW);
        const y1 = wToY(fromW, maxW, plotH);
        const x2 = tempToX(toPt.temp, minTemp, maxTemp, plotW);
        const y2 = wToY(toW, maxW, plotH);

        const processColors: Record<string, string> = {
          sensible: '#f59e0b', latent: '#06b6d4', mixed: '#a855f7',
          cooling: '#3b82f6', heating: '#ef4444',
        };

        ctx.save();
        ctx.strokeStyle = processColors[line.type] ?? '#f59e0b';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // Arrow head
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 8 * Math.cos(angle - 0.4), y2 - 8 * Math.sin(angle - 0.4));
        ctx.lineTo(x2 - 8 * Math.cos(angle + 0.4), y2 - 8 * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = processColors[line.type] ?? '#f59e0b';
        ctx.fill();
        ctx.restore();
      }
    }

    // ─── State Points ─────────────────────────────────────────
    for (const pt of points) {
      const w = humidityRatio(pt.temp, pt.rh, P_ATM);
      const x = tempToX(pt.temp, minTemp, maxTemp, plotW);
      const y = wToY(w, maxW, plotH);
      const color = pt.color ?? '#ef4444';

      // Glow
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      // Label
      drawText(ctx, pt.label, x, y - 12, { color, size: 10 });
    }

    // Title
    drawText(ctx, 'PSYCHROMETRIC CHART', width / 2, 14, { size: 13, color: '#e2e8f0' });

  }, [points, processLines, showComfortZone, width, height, minTemp, maxTemp, plotW, plotH, maxW]);

  // ─── Mouse Hover for Live Readout ───────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (mx < PADDING.left || mx > width - PADDING.right || my < PADDING.top || my > height - PADDING.bottom) {
      setHoveredState(null);
      setMousePos(null);
      return;
    }

    const temp = xToTemp(mx);
    const w = yToW(my);
    // Convert humidity ratio back to RH
    const pws = saturationPressure(temp);
    const pw = (w * P_ATM) / (0.62198 + w);
    const rh = Math.max(0, Math.min(100, (pw / pws) * 100));

    setHoveredState(psychrometricState(temp, rh));
    setMousePos({ x: mx, y: my });
  }, [width, height, xToTemp, yToW]);

  const handleMouseLeave = useCallback(() => {
    setHoveredState(null);
    setMousePos(null);
  }, []);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded-xl border border-border cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {/* Hover tooltip */}
      {hoveredState && mousePos && (
        <div
          className="absolute z-50 pointer-events-none rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs font-mono shadow-lg backdrop-blur"
          style={{ left: mousePos.x + 14, top: mousePos.y - 60 }}
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <span className="text-muted-foreground">Dry-Bulb:</span><span>{hoveredState.dryBulb.toFixed(1)} °C</span>
            <span className="text-muted-foreground">RH:</span><span>{hoveredState.relativeHumidity.toFixed(0)}%</span>
            <span className="text-muted-foreground">Wet-Bulb:</span><span>{hoveredState.wetBulb.toFixed(1)} °C</span>
            <span className="text-muted-foreground">Dew Point:</span><span>{hoveredState.dewPoint.toFixed(1)} °C</span>
            <span className="text-muted-foreground">W:</span><span>{(hoveredState.humidityRatio * 1000).toFixed(2)} g/kg</span>
            <span className="text-muted-foreground">Enthalpy:</span><span>{hoveredState.enthalpy.toFixed(1)} kJ/kg</span>
          </div>
        </div>
      )}
    </div>
  );
}

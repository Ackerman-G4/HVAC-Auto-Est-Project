'use client';

import { TemperatureHeatmap } from './TemperatureHeatmap';
import { AlertTriangle, ShieldCheck, Thermometer, TrendingUp, Wind, Zap } from 'lucide-react';
import React from 'react';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { useSimulationStore } from '@/stores/simulation-store';

// ─── Results Panel ──────────────────────────────────────────────────

export function ResultsPanel() {
  const { result, complianceReport, failureResult, pueAnalysis, optimizationResult } = useSimulationStore();

  if (!result) {
    return (
      <EmptyState
        className="panel-glass h-64"
        icon={<Wind size={28} />}
        title="No simulation results yet"
        description="Place equipment and run a CFD simulation"
      />
    );
  }

  const m = result.metrics;

  return (
    <div className="space-y-8">
      {/* Metrics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Max Temperature" value={`${m.maxTemperature.toFixed(1)}°C`} icon={Thermometer} />
        <StatCard title="Avg Temperature" value={`${m.avgTemperature.toFixed(1)}°C`} icon={Thermometer} />
        <StatCard title="Hotspots" value={m.hotspots.length} subtitle={m.hotspots.filter(h => h.severity === 'critical').length + ' critical'} icon={AlertTriangle} />
        <StatCard title="PUE" value={m.pue.toFixed(2)} subtitle={m.pue <= 1.5 ? 'Good' : m.pue <= 2.0 ? 'Average' : 'Poor'} icon={Zap} />
      </div>

      {/* Temperature Heatmap */}
        <div className="panel-glass rounded-md border border-border/70 bg-card p-6 shadow-sm">
        <TemperatureHeatmap />
      </div>

      {/* Rack Inlet Temperatures */}
      {m.rackInletTemps.length > 0 && (
        <div className="panel-glass rounded-md border border-border/70 bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-foreground">Rack Inlet Temperatures</h3>
          <div className="space-y-2">
            {m.rackInletTemps.map(rack => {
              const pct = ((rack.avgTemp - 15) / 30) * 100;
              const barColor = rack.avgTemp > 35 ? 'bg-red-500' : rack.avgTemp > 27 ? 'bg-amber-500' : 'bg-emerald-500';
              const filledSegments = Math.max(1, Math.min(20, Math.round(pct / 5)));
              return (
                <div key={rack.rackId} className="flex items-center gap-4">
                  <span className="w-32 truncate text-sm font-medium text-muted-foreground">{rack.rackId.slice(0, 8)}</span>
                  <div className="grid h-3 flex-1 grid-cols-20 gap-0.5 overflow-hidden rounded-full bg-secondary/70 p-0.5">
                    {Array.from({ length: 20 }).map((_, index) => (
                      <span
                        key={`${rack.rackId}-seg-${index}`}
                        className={`rounded-sm ${index < filledSegments ? barColor : 'bg-secondary/40'}`}
                      />
                    ))}
                  </div>
                  <span className="w-16 text-right text-sm font-bold text-foreground">{rack.avgTemp.toFixed(1)}°C</span>
                  <span className="w-24 text-sm text-muted-foreground">(max {rack.maxTemp.toFixed(1)}°C)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hotspots Detail */}
      {m.hotspots.length > 0 && (
        <div className="panel-glass rounded-md border border-border/70 bg-card p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <AlertTriangle size={20} className="text-amber-500" /> Detected Hotspots
          </h3>
          <div className="space-y-3">
            {m.hotspots.map((hs, i) => (
              <div key={i} className={`flex items-center justify-between p-4 rounded-md border ${
                hs.severity === 'emergency' ? 'bg-[rgba(216,77,87,0.1)] border-[rgba(216,77,87,0.3)]' :
                hs.severity === 'critical' ? 'bg-[rgba(219,142,47,0.14)] border-[rgba(219,142,47,0.35)]' :
                'bg-[rgba(206,161,74,0.14)] border-[rgba(206,161,74,0.35)]'
              }`}>
                <div>
                  <span className={`rounded-sm px-2.5 py-1 text-sm font-bold font-display ${
                    hs.severity === 'emergency' ? 'bg-[rgba(216,77,87,0.18)] text-destructive' :
                    hs.severity === 'critical' ? 'bg-[rgba(219,142,47,0.18)] text-warning' :
                    'bg-[rgba(206,161,74,0.2)] text-accent'
                  }`}>{hs.severity}</span>
                  <span className="ml-3 text-sm text-foreground/90">
                    Position: ({hs.position.x.toFixed(1)}, {hs.position.y.toFixed(1)}, {hs.position.z.toFixed(1)})m
                  </span>
                </div>
                <span className="text-lg font-semibold text-foreground">{hs.temperature.toFixed(1)}°C</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ASHRAE Compliance */}
      {complianceReport && (
        <div className="panel-glass rounded-md border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <ShieldCheck size={20} className={complianceReport.overallPass ? 'text-emerald-500' : 'text-red-500'} />
              ASHRAE TC 9.9 Compliance — Class {complianceReport.thermalClass}
            </h3>
            <div className={`px-4 py-2 rounded-md text-sm font-bold ${
              complianceReport.overallPass ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              Score: {complianceReport.score}/100
            </div>
          </div>
          <div className="space-y-2">
            {complianceReport.checks.map((check, i) => (
              <div key={i} className={`flex items-center justify-between rounded-sm border p-3 ${
                check.passed
                  ? 'border-border bg-secondary/50'
                  : check.severity === 'critical'
                    ? 'border-[rgba(216,77,87,0.32)] bg-[rgba(216,77,87,0.1)]'
                    : 'border-[rgba(219,142,47,0.32)] bg-[rgba(219,142,47,0.12)]'
              }`}>
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${check.passed ? 'bg-emerald-500' : check.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <span className="text-sm font-medium text-foreground">{check.description}</span>
                </div>
                <span className="text-sm font-bold text-muted-foreground">{check.value} {check.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PUE Analysis */}
      {pueAnalysis && (
        <div className="panel-glass rounded-md border border-border/70 bg-card p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Zap size={20} className="text-accent" /> Energy Efficiency (PUE)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="rounded-md border border-border bg-background p-4 text-center">
              <p className="text-3xl font-semibold text-accent">{pueAnalysis.pue}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">PUE</p>
            </div>
            <div className="rounded-md border border-border bg-secondary/50 p-4 text-center">
              <p className="text-xl font-bold text-foreground">{pueAnalysis.itEquipmentPower} kW</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">IT Power</p>
            </div>
            <div className="rounded-md border border-border bg-secondary/50 p-4 text-center">
              <p className="text-xl font-bold text-foreground">{pueAnalysis.coolingPower} kW</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Cooling Power</p>
            </div>
            <div className="rounded-md border border-border bg-secondary/50 p-4 text-center">
              <p className="text-xl font-bold text-foreground">{pueAnalysis.totalFacilityPower} kW</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Total Power</p>
            </div>
            <div className="rounded-md border border-border bg-background p-4 text-center">
              <p className={`text-xl font-bold ${
                pueAnalysis.rating === 'excellent' ? 'text-emerald-600' :
                pueAnalysis.rating === 'good' ? 'text-accent' :
                pueAnalysis.rating === 'average' ? 'text-amber-600' : 'text-red-600'
              }`}>{pueAnalysis.rating.toUpperCase()}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Rating</p>
            </div>
          </div>
          {pueAnalysis.recommendations.length > 0 && (
            <div className="mt-4 rounded-md border border-accent/30 bg-accent/10 p-4">
              <p className="mb-2 text-sm font-bold text-accent">Recommendations:</p>
              <ul className="space-y-1">
                {pueAnalysis.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="mt-0.5 text-accent">•</span> {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Failure Simulation */}
      {failureResult && (
        <div className="panel-glass rounded-md border border-border/70 bg-card p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <AlertTriangle size={20} className="text-red-500" /> Failure Analysis: {failureResult.scenario.replace(/_/g, ' ').toUpperCase()}
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="rounded-md border border-[rgba(219,142,47,0.35)] bg-[rgba(219,142,47,0.14)] p-4 text-center">
              <p className="text-2xl font-semibold text-yellow-700">{failureResult.timeToWarning >= 0 ? `${Math.round(failureResult.timeToWarning / 60)}m` : 'N/A'}</p>
              <p className="mt-1 text-sm font-semibold text-yellow-600">Time to Warning</p>
            </div>
            <div className="rounded-md border border-[rgba(216,77,87,0.35)] bg-[rgba(216,77,87,0.1)] p-4 text-center">
              <p className="text-2xl font-semibold text-red-700">{failureResult.timeToCritical >= 0 ? `${Math.round(failureResult.timeToCritical / 60)}m` : 'N/A'}</p>
              <p className="mt-1 text-sm font-semibold text-red-600">Time to Critical</p>
            </div>
            <div className="rounded-md border border-border bg-background p-4 text-center">
              <p className="text-2xl font-semibold text-foreground">{failureResult.affectedRacks.length}</p>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">Affected Racks</p>
            </div>
          </div>
          {failureResult.recommendations.length > 0 && (
            <div className="rounded-md border border-red-500/20 bg-red-500/8 p-4">
              <ul className="space-y-1">
                {failureResult.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-destructive">
                    <span className="text-red-400 mt-0.5">•</span> {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Optimization Results */}
      {optimizationResult && (
        <div className="rounded-md border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <TrendingUp size={20} className="text-emerald-500" /> Optimization Results
          </h3>
          <div className="flex items-center gap-4 mb-6">
            <div className="text-center p-4 bg-emerald-50 border border-emerald-200 rounded-md">
              <p className="text-3xl font-semibold text-emerald-600">{optimizationResult.improvement}%</p>
              <p className="mt-1 text-sm font-semibold text-emerald-600">Improvement</p>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="rounded-sm border border-border bg-secondary/50 p-3">
                <p className="text-sm font-semibold text-muted-foreground">Before: Max Temp</p>
                <p className="text-lg font-bold text-foreground">{optimizationResult.initialMetrics.maxTemperature.toFixed(1)}°C</p>
              </div>
              <div className="rounded-sm border border-border bg-secondary/50 p-3">
                <p className="text-sm font-semibold text-muted-foreground">After: Max Temp</p>
                <p className="text-lg font-bold text-emerald-600">{optimizationResult.optimizedMetrics.maxTemperature.toFixed(1)}°C</p>
              </div>
            </div>
          </div>
          <h4 className="mb-3 text-sm font-bold text-foreground">Suggestions ({optimizationResult.suggestions.length})</h4>
          <div className="space-y-2">
            {optimizationResult.suggestions.map((sug, i) => (
              <div key={i} className="flex items-center justify-between rounded-sm border border-border bg-secondary/50 p-3">
                <span className="text-sm text-foreground">{sug.description}</span>
                <span className="rounded-sm bg-emerald-100 px-2.5 py-1 text-sm font-semibold text-emerald-700">{sug.impact}% impact</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

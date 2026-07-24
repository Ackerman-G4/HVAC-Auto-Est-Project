import { TermHint } from '@/components/ui/term-hint';
import type { PsychrometricSnapshot } from '../types';

export const PSYCHROMETRIC_METRICS: Array<{
  term: string;
  definition: string;
  formatValue: (state: PsychrometricSnapshot) => string;
}> = [
  {
    term: 'DB',
    definition: 'Dry-bulb temperature: the actual air temperature measured by a standard thermometer.',
    formatValue: (state) => `${state.dryBulb}°C`,
  },
  {
    term: 'WB',
    definition: 'Wet-bulb temperature: indicates evaporative cooling potential and moisture influence.',
    formatValue: (state) => `${state.wetBulb}°C`,
  },
  {
    term: 'RH',
    definition: 'Relative humidity: percentage of moisture in air relative to saturation at the same temperature.',
    formatValue: (state) => `${state.relativeHumidity}%`,
  },
  {
    term: 'Dew Pt',
    definition: 'Dew point temperature: point where air becomes saturated and condensation begins.',
    formatValue: (state) => `${state.dewPoint}°C`,
  },
  {
    term: 'W (g/kg)',
    definition: 'Humidity ratio: grams of water vapor per kilogram of dry air.',
    formatValue: (state) => (state.humidityRatio * 1000).toFixed(1),
  },
  {
    term: 'h (kJ/kg)',
    definition: 'Specific enthalpy: total heat content per kilogram of dry air.',
    formatValue: (state) => String(state.enthalpy),
  },
];

export function PsychrometricMetricGrid({
  state,
  toneClassName,
}: {
  state: PsychrometricSnapshot;
  toneClassName: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5 text-center">
      {PSYCHROMETRIC_METRICS.map((metric) => (
        <div key={metric.term} className={`rounded py-1.5 ${toneClassName}`}>
          <p className="text-sm font-bold tabular-nums">{metric.formatValue(state)}</p>
          <p className="text-[8px] uppercase tracking-wider text-muted-foreground">
            <TermHint term={metric.term} definition={metric.definition} compact />
          </p>
        </div>
      ))}
    </div>
  );
}

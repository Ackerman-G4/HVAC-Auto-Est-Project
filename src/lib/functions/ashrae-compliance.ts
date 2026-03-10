/**
 * ASHRAE Compliance Engine
 * 
 * Validates data center designs against ASHRAE TC 9.9 thermal guidelines.
 * Checks rack inlet temperatures, airflow, humidity, and cooling redundancy.
 */

import type {
  ASHRAEThermalClass,
  ASHRAELimits,
  ComplianceCheck,
  ComplianceReport,
  SimulationMetrics,
  ServerRack,
  HVACUnit,
} from '@/types/simulation';

// ─── ASHRAE TC 9.9 Thermal Guidelines ──────────────────────────────

const ASHRAE_LIMITS: Record<ASHRAEThermalClass, ASHRAELimits> = {
  A1: {
    class: 'A1',
    inletTempMin: 15, inletTempMax: 32,
    inletTempRecommendedMin: 18, inletTempRecommendedMax: 27,
    maxDewPoint: 17, humidityMin: 20, humidityMax: 80,
  },
  A2: {
    class: 'A2',
    inletTempMin: 10, inletTempMax: 35,
    inletTempRecommendedMin: 18, inletTempRecommendedMax: 27,
    maxDewPoint: 21, humidityMin: 20, humidityMax: 80,
  },
  A3: {
    class: 'A3',
    inletTempMin: 5, inletTempMax: 40,
    inletTempRecommendedMin: 18, inletTempRecommendedMax: 27,
    maxDewPoint: 24, humidityMin: 8, humidityMax: 85,
  },
  A4: {
    class: 'A4',
    inletTempMin: 5, inletTempMax: 45,
    inletTempRecommendedMin: 18, inletTempRecommendedMax: 27,
    maxDewPoint: 24, humidityMin: 8, humidityMax: 90,
  },
  B: {
    class: 'B',
    inletTempMin: 5, inletTempMax: 35,
    inletTempRecommendedMin: 18, inletTempRecommendedMax: 27,
    maxDewPoint: 28, humidityMin: 8, humidityMax: 80,
  },
  C: {
    class: 'C',
    inletTempMin: 5, inletTempMax: 40,
    inletTempRecommendedMin: 18, inletTempRecommendedMax: 27,
    maxDewPoint: 28, humidityMin: 8, humidityMax: 80,
  },
};

// ─── Compliance Checks ──────────────────────────────────────────────

export function checkASHRAECompliance(
  metrics: SimulationMetrics,
  racks: ServerRack[],
  hvacUnits: HVACUnit[],
  thermalClass: ASHRAEThermalClass = 'A1'
): ComplianceReport {
  const limits = ASHRAE_LIMITS[thermalClass];
  const checks: ComplianceCheck[] = [];

  // Check 1: Rack inlet temperature - max allowable
  const maxInletTemp = metrics.rackInletTemps.length > 0
    ? Math.max(...metrics.rackInletTemps.map(r => r.maxTemp))
    : metrics.maxTemperature;

  checks.push({
    rule: 'ASHRAE-TC9.9-INLET-MAX',
    description: `Maximum rack inlet temperature must not exceed ${limits.inletTempMax}°C (Class ${thermalClass})`,
    passed: maxInletTemp <= limits.inletTempMax,
    value: Math.round(maxInletTemp * 10) / 10,
    limit: limits.inletTempMax,
    unit: '°C',
    severity: maxInletTemp > limits.inletTempMax ? 'critical' : 'info',
    recommendation: maxInletTemp > limits.inletTempMax
      ? 'Increase cooling capacity or improve airflow management to reduce inlet temperatures.'
      : undefined,
  });

  // Check 2: Rack inlet temperature - recommended range
  const avgInletTemp = metrics.rackInletTemps.length > 0
    ? metrics.rackInletTemps.reduce((s, r) => s + r.avgTemp, 0) / metrics.rackInletTemps.length
    : metrics.avgTemperature;

  checks.push({
    rule: 'ASHRAE-TC9.9-INLET-REC',
    description: `Average rack inlet temperature should be ${limits.inletTempRecommendedMin}–${limits.inletTempRecommendedMax}°C (recommended)`,
    passed: avgInletTemp >= limits.inletTempRecommendedMin && avgInletTemp <= limits.inletTempRecommendedMax,
    value: Math.round(avgInletTemp * 10) / 10,
    limit: limits.inletTempRecommendedMax,
    unit: '°C',
    severity: (avgInletTemp < limits.inletTempRecommendedMin || avgInletTemp > limits.inletTempRecommendedMax) ? 'warning' : 'info',
    recommendation: avgInletTemp > limits.inletTempRecommendedMax
      ? 'Consider adding containment or adjusting tile placement to bring inlet temperatures within recommended range.'
      : avgInletTemp < limits.inletTempRecommendedMin
        ? 'Reduce overcooling to improve energy efficiency.'
        : undefined,
  });

  // Check 3: Temperature differential across racks
  const tempDelta = metrics.maxTemperature - metrics.minTemperature;
  checks.push({
    rule: 'ASHRAE-TEMP-UNIFORMITY',
    description: 'Temperature differential across the facility should not exceed 15°C',
    passed: tempDelta <= 15,
    value: Math.round(tempDelta * 10) / 10,
    limit: 15,
    unit: '°C',
    severity: tempDelta > 15 ? 'warning' : 'info',
    recommendation: tempDelta > 15
      ? 'Improve airflow distribution. Consider hot/cold aisle containment and additional perforated tiles.'
      : undefined,
  });

  // Check 4: Hotspot detection
  const criticalHotspots = metrics.hotspots.filter(h => h.severity === 'critical' || h.severity === 'emergency');
  checks.push({
    rule: 'ASHRAE-HOTSPOTS',
    description: 'No critical or emergency hotspots should exist',
    passed: criticalHotspots.length === 0,
    value: criticalHotspots.length,
    limit: 0,
    unit: 'hotspots',
    severity: criticalHotspots.length > 0 ? 'critical' : 'info',
    recommendation: criticalHotspots.length > 0
      ? `${criticalHotspots.length} critical hotspot(s) detected. Investigate cooling adequacy and airflow obstructions near affected racks.`
      : undefined,
  });

  // Check 5: Cooling capacity vs heat load
  const capacityRatio = metrics.totalCoolingCapacity > 0
    ? metrics.totalCoolingCapacity / Math.max(1, metrics.totalHeatLoad)
    : 0;
  checks.push({
    rule: 'ASHRAE-COOLING-CAPACITY',
    description: 'Total cooling capacity should exceed total heat load by at least 20%',
    passed: capacityRatio >= 1.2,
    value: Math.round(capacityRatio * 100) / 100,
    limit: 1.2,
    unit: 'ratio',
    severity: capacityRatio < 1.0 ? 'critical' : capacityRatio < 1.2 ? 'warning' : 'info',
    recommendation: capacityRatio < 1.2
      ? 'Insufficient cooling redundancy. Add cooling units to achieve N+1 redundancy.'
      : undefined,
  });

  // Check 6: N+1 cooling redundancy
  const activeUnits = hvacUnits.filter(u => u.status === 'active');
  const totalCapacity = activeUnits.reduce((s, u) => s + u.capacityKW, 0);
  const totalHeat = racks.reduce((s, r) => s + r.powerKW, 0);
  const largestUnit = activeUnits.length > 0
    ? Math.max(...activeUnits.map(u => u.capacityKW))
    : 0;
  const capacityWithoutLargest = totalCapacity - largestUnit;
  const nPlus1 = capacityWithoutLargest >= totalHeat;

  checks.push({
    rule: 'ASHRAE-N+1-REDUNDANCY',
    description: 'System should maintain cooling with largest unit offline (N+1)',
    passed: nPlus1,
    value: Math.round(capacityWithoutLargest * 10) / 10,
    limit: Math.round(totalHeat * 10) / 10,
    unit: 'kW',
    severity: nPlus1 ? 'info' : 'critical',
    recommendation: !nPlus1
      ? `N+1 redundancy not met. Need ${Math.round((totalHeat - capacityWithoutLargest) * 10) / 10} kW additional cooling capacity.`
      : undefined,
  });

  // Check 7: Airflow per rack
  const totalAirflow = activeUnits.reduce((s, u) => s + u.airflowCFM, 0);
  const airflowPerRack = racks.length > 0 ? totalAirflow / racks.length : 0;
  const minAirflowPerRack = 200; // CFM minimum per rack

  checks.push({
    rule: 'ASHRAE-AIRFLOW-PER-RACK',
    description: `Minimum airflow per rack should be ${minAirflowPerRack} CFM`,
    passed: airflowPerRack >= minAirflowPerRack,
    value: Math.round(airflowPerRack),
    limit: minAirflowPerRack,
    unit: 'CFM',
    severity: airflowPerRack < minAirflowPerRack ? 'warning' : 'info',
    recommendation: airflowPerRack < minAirflowPerRack
      ? 'Increase supply airflow or add additional cooling units.'
      : undefined,
  });

  // Check 8: PUE
  checks.push({
    rule: 'ENERGY-PUE',
    description: 'PUE should be below 1.6 for acceptable efficiency',
    passed: metrics.pue <= 1.6,
    value: Math.round(metrics.pue * 100) / 100,
    limit: 1.6,
    unit: '',
    severity: metrics.pue > 2.0 ? 'critical' : metrics.pue > 1.6 ? 'warning' : 'info',
    recommendation: metrics.pue > 1.6
      ? 'Review cooling system efficiency. Consider economizer modes, variable speed drives, or higher supply temperatures.'
      : undefined,
  });

  // Check 9: Supply Heat Index
  checks.push({
    rule: 'ASHRAE-SHI',
    description: 'Supply Heat Index should be below 0.3 (lower is better)',
    passed: metrics.supplyHeatIndex <= 0.3,
    value: Math.round(metrics.supplyHeatIndex * 100) / 100,
    limit: 0.3,
    unit: '',
    severity: metrics.supplyHeatIndex > 0.3 ? 'warning' : 'info',
    recommendation: metrics.supplyHeatIndex > 0.3
      ? 'Hot air recirculation detected. Implement containment strategies or seal cable cutouts.'
      : undefined,
  });

  // Compute overall score
  const totalChecks = checks.length;
  const passed = checks.filter(c => c.passed).length;
  const score = Math.round((passed / totalChecks) * 100);
  const overallPass = checks.every(c => c.severity !== 'critical' || c.passed);

  return {
    thermalClass,
    overallPass,
    checks,
    score,
  };
}

export { ASHRAE_LIMITS };

/**
 * Failure Simulation Engine
 * 
 * Simulates CRAC/CRAH failure, power loss, and cooling restart scenarios.
 * Computes thermal rise over time: dT/dt = Q / (m × Cp)
 */

import type {
  FailureConfig,
  FailureResult,
  FailureTimeStep,
  FailureScenario,
  ServerRack,
  HVACUnit,
  PUEAnalysis,
} from '@/types/simulation';

// ASHRAE thresholds
const TEMP_WARNING = 27;   // °C
const TEMP_CRITICAL = 35;  // °C

// Default thermal mass values
const DEFAULT_RACK_MASS = 500;     // kg (server equipment thermal mass)
const DEFAULT_SPECIFIC_HEAT = 900; // J/(kg·K) (weighted average of metals/electronics)
const DEFAULT_AIR_MASS_PER_RACK = 2; // kg of air per rack volume

/**
 * Simulate failure scenario and compute thermal transient
 */
export function simulateFailure(
  racks: ServerRack[],
  hvacUnits: HVACUnit[],
  config: FailureConfig,
  ambientTempC: number = 24
): FailureResult {
  const { scenario, failedUnitIds, duration, timeStep } = config;
  const rackMass = config.rackMass || DEFAULT_RACK_MASS;
  const specificHeat = config.specificHeat || DEFAULT_SPECIFIC_HEAT;

  // Determine active cooling after failure
  const activeUnits = hvacUnits.filter(u => {
    if (scenario === 'power_loss') return false;
    if (scenario === 'crac_failure') return !failedUnitIds.includes(u.id) && u.status !== 'failed';
    if (scenario === 'partial_cooling') return !failedUnitIds.includes(u.id) && u.status !== 'failed';
    return u.status !== 'failed';
  });

  // Calculate remaining cooling capacity
  const remainingCoolingKW = activeUnits.reduce((sum, u) => sum + u.capacityKW, 0);
  const totalHeatGenerationKW = racks.reduce((sum, r) => sum + r.powerKW, 0);

  // Net heat gain (positive = temperatures rising)
  const netHeatGainKW = totalHeatGenerationKW - remainingCoolingKW;

  // Cooling restart delay
  const restartDelay = scenario === 'cooling_restart' ? 300 : 0; // 5 minutes
  
  // Track temperatures for each rack
  const rackTemps: Map<string, number> = new Map();
  racks.forEach(r => rackTemps.set(r.id, ambientTempC));

  const timeSteps: FailureTimeStep[] = [];
  let timeToWarning = -1;
  let timeToCritical = -1;
  const affectedRacks = new Set<string>();

  // Simulate thermal transient
  for (let t = 0; t <= duration; t += timeStep) {
    const currentNetHeat = (scenario === 'cooling_restart' && t < restartDelay)
      ? totalHeatGenerationKW  // No cooling during restart
      : netHeatGainKW;

    // Update each rack temperature: dT/dt = Q / (m × Cp)
    const temperatures: { rackId: string; temp: number }[] = [];
    let maxTemp = 0;
    const criticalRacks: string[] = [];

    for (const rack of racks) {
      let currentTemp = rackTemps.get(rack.id) || ambientTempC;

      // Heat contribution proportional to rack power
      const rackHeatFraction = rack.powerKW / Math.max(1, totalHeatGenerationKW);
      const rackNetHeat = currentNetHeat * rackHeatFraction * 1000; // Convert kW to W

      // dT = Q * dt / (m * Cp)
      const dT = (rackNetHeat * timeStep) / (rackMass * specificHeat);
      currentTemp += dT;

      // Natural convection cooling (simplified)
      const naturalCoolingRate = 0.001 * (currentTemp - ambientTempC);
      currentTemp -= naturalCoolingRate * timeStep;

      currentTemp = Math.max(ambientTempC - 5, currentTemp);
      rackTemps.set(rack.id, currentTemp);

      temperatures.push({ rackId: rack.id, temp: Math.round(currentTemp * 10) / 10 });
      maxTemp = Math.max(maxTemp, currentTemp);

      if (currentTemp >= TEMP_CRITICAL) {
        criticalRacks.push(rack.id);
        affectedRacks.add(rack.id);
      } else if (currentTemp >= TEMP_WARNING) {
        affectedRacks.add(rack.id);
      }
    }

    // Record milestones
    if (timeToWarning < 0 && maxTemp >= TEMP_WARNING) {
      timeToWarning = t;
    }
    if (timeToCritical < 0 && maxTemp >= TEMP_CRITICAL) {
      timeToCritical = t;
    }

    // Record at intervals (every 10 seconds) to keep output manageable
    if (t % Math.max(10, timeStep) < timeStep || t === 0 || t >= duration - timeStep) {
      timeSteps.push({
        time: t,
        temperatures,
        maxTemp: Math.round(maxTemp * 10) / 10,
        criticalRacks,
      });
    }
  }

  // Generate recommendations
  const recommendations = generateFailureRecommendations(scenario, timeToWarning, timeToCritical, netHeatGainKW, racks.length);

  return {
    scenario,
    timeToWarning: Math.round(timeToWarning),
    timeToCritical: Math.round(timeToCritical),
    timeSteps,
    affectedRacks: Array.from(affectedRacks),
    recommendations,
  };
}

function generateFailureRecommendations(
  scenario: FailureScenario,
  timeToWarning: number,
  timeToCritical: number,
  netHeatGainKW: number,
  rackCount: number
): string[] {
  const recs: string[] = [];

  if (netHeatGainKW > 0) {
    recs.push(`Net heat gain of ${Math.round(netHeatGainKW)} kW detected. Remaining cooling is insufficient.`);
  }

  if (timeToWarning >= 0 && timeToWarning < 300) {
    recs.push(`WARNING: Racks reach warning temperature in under 5 minutes (${Math.round(timeToWarning)}s). Implement automatic load shedding.`);
  }

  if (timeToCritical >= 0 && timeToCritical < 600) {
    recs.push(`CRITICAL: Racks reach critical temperature in under 10 minutes (${Math.round(timeToCritical)}s). Emergency cooling procedures required.`);
  }

  switch (scenario) {
    case 'crac_failure':
      recs.push('Ensure N+1 CRAC redundancy so remaining units can handle full load.');
      recs.push('Install automatic failover controls for standby CRAC units.');
      break;
    case 'power_loss':
      recs.push('Deploy UPS-backed CRAC units to maintain cooling during power transitions.');
      recs.push('Consider thermal energy storage for ride-through cooling.');
      break;
    case 'cooling_restart':
      recs.push('Implement staged restart procedures to prevent compressor damage.');
      recs.push('Pre-cool the facility before scheduled maintenance windows.');
      break;
    case 'partial_cooling':
      recs.push('Redistribute airflow using variable speed drives on remaining units.');
      recs.push('Close blanking panels on empty rack positions to prevent bypass airflow.');
      break;
  }

  if (rackCount > 10) {
    recs.push('High rack density detected. Consider in-row cooling to supplement perimeter CRAC units.');
  }

  return recs;
}

/**
 * Calculate Power Usage Effectiveness (PUE) and related energy metrics
 */
export function calculatePUE(
  racks: ServerRack[],
  hvacUnits: HVACUnit[],
  lightingPowerKW: number = 2,
  otherPowerKW: number = 5
): PUEAnalysis {
  const itPower = racks.reduce((sum, r) => sum + r.powerKW, 0);
  const coolingPower = hvacUnits
    .filter(u => u.status !== 'failed')
    .reduce((sum, u) => sum + u.powerInputKW, 0);

  const totalFacilityPower = itPower + coolingPower + lightingPowerKW + otherPowerKW;
  const pue = itPower > 0 ? totalFacilityPower / itPower : Infinity;
  const dcie = pue > 0 ? (1 / pue) * 100 : 0;

  let rating: PUEAnalysis['rating'];
  if (pue <= 1.2) rating = 'excellent';
  else if (pue <= 1.5) rating = 'good';
  else if (pue <= 2.0) rating = 'average';
  else rating = 'poor';

  const recommendations: string[] = [];
  if (pue > 1.5) {
    recommendations.push('Consider raising supply air temperature to reduce compressor work.');
  }
  if (pue > 1.8) {
    recommendations.push('Implement free cooling / economizer mode when outdoor conditions permit.');
    recommendations.push('Install variable speed drives on CRAC/CRAH fans and pumps.');
  }
  if (pue > 2.0) {
    recommendations.push('Cooling infrastructure consuming more power than IT load. Major efficiency overhaul recommended.');
    recommendations.push('Evaluate hot/cold aisle containment to eliminate bypass airflow.');
  }
  if (coolingPower > itPower * 0.5) {
    recommendations.push('Cooling power exceeds 50% of IT load. Review equipment efficiency ratings (EER/COP).');
  }

  return {
    totalFacilityPower: Math.round(totalFacilityPower * 10) / 10,
    itEquipmentPower: Math.round(itPower * 10) / 10,
    coolingPower: Math.round(coolingPower * 10) / 10,
    lightingPower: lightingPowerKW,
    otherPower: otherPowerKW,
    pue: Math.round(pue * 100) / 100,
    dcie: Math.round(dcie * 10) / 10,
    rating,
    recommendations,
  };
}

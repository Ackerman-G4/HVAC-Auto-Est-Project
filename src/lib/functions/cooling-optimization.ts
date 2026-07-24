/**
 * Cooling Optimization Engine
 * 
 * Iteratively tests design variations to minimize hotspot severity.
 * Adjusts tile placement, CRAC positions, and rack layout.
 */

import type {
  SimulationInput,
  SimulationMetrics,
  OptimizationConfig,
  OptimizationResult,
  OptimizationSuggestion,
  OptimizationIteration,
  PerforatedTile,
  HVACUnit,
  ServerRack,
} from '@/types/simulation';
import { runCFDSimulation } from './cfd-simulation';

// ─── Scoring Function ───────────────────────────────────────────────

function computeScore(metrics: SimulationMetrics, config: OptimizationConfig): number {
  let score = 0;

  for (const target of config.targets) {
    switch (target.type) {
      case 'minimize_hotspots': {
        const hotspotPenalty = metrics.hotspots.reduce((sum, h) => {
          const weight = h.severity === 'emergency' ? 10 : h.severity === 'critical' ? 5 : 1;
          return sum + weight * (h.temperature - 27);
        }, 0);
        score += target.weight * hotspotPenalty;
        break;
      }
      case 'minimize_pue':
        score += target.weight * (metrics.pue - 1.0) * 100;
        break;
      case 'balance_airflow': {
        const tempVariance = metrics.rackInletTemps.length > 1
          ? metrics.rackInletTemps.reduce((sum, r) => sum + (r.avgTemp - metrics.avgTemperature) ** 2, 0) / metrics.rackInletTemps.length
          : 0;
        score += target.weight * tempVariance;
        break;
      }
    }
  }

  return score;
}

// ─── Tile Optimization ──────────────────────────────────────────────

function optimizeTiles(
  input: SimulationInput,
  baseMetrics: SimulationMetrics
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  // For each hotspot, suggest adding a perforated tile nearby
  for (const hotspot of baseMetrics.hotspots) {
    const tileX = Math.floor(hotspot.position.x / input.config.gridResolution);
    const tileY = Math.floor(hotspot.position.y / input.config.gridResolution);

    // Check if tile already exists at this location
    const existingTile = input.tiles.find(t => t.x === tileX && t.y === tileY);
    if (!existingTile) {
      suggestions.push({
        type: 'add_tile',
        description: `Add perforated tile at grid position (${tileX}, ${tileY}) near hotspot at ${hotspot.temperature.toFixed(1)}°C`,
        impact: hotspot.severity === 'emergency' ? 15 : hotspot.severity === 'critical' ? 10 : 5,
        position: { x: tileX * input.config.gridResolution, y: tileY * input.config.gridResolution, z: 0 },
        parameters: { openArea: 0.25 },
      });
    } else if (existingTile.openArea < 0.4) {
      // Suggest increasing tile open area
      suggestions.push({
        type: 'add_tile',
        description: `Increase tile open area at (${tileX}, ${tileY}) from ${(existingTile.openArea * 100).toFixed(0)}% to 40%`,
        impact: 5,
        position: { x: tileX * input.config.gridResolution, y: tileY * input.config.gridResolution, z: 0 },
        parameters: { openArea: 0.4 },
      });
    }
  }

  // Check for tiles that may be wasting cold air (far from racks)
  for (const tile of input.tiles) {
    const tilePos = { x: tile.x * input.config.gridResolution, y: tile.y * input.config.gridResolution };
    const nearestRackDist = Math.min(...input.racks.map(r =>
      Math.sqrt((r.position.x - tilePos.x) ** 2 + (r.position.y - tilePos.y) ** 2)
    ));

    if (nearestRackDist > 5 && input.racks.length > 0) {
      suggestions.push({
        type: 'remove_tile',
        description: `Remove perforated tile at (${tile.x}, ${tile.y}) — ${nearestRackDist.toFixed(1)}m from nearest rack, wasting cold air`,
        impact: 3,
        position: { x: tilePos.x, y: tilePos.y, z: 0 },
      });
    }
  }

  return suggestions;
}

// ─── CRAC Optimization ──────────────────────────────────────────────

function optimizeCRAC(
  input: SimulationInput,
  baseMetrics: SimulationMetrics
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  // Check if any CRAC units are too far from hotspots
  for (const hotspot of baseMetrics.hotspots) {
    let closestUnit: HVACUnit | null = null;
    let closestDist = Infinity;

    for (const unit of input.hvacUnits) {
      const dist = Math.sqrt(
        (unit.position.x - hotspot.position.x) ** 2 +
        (unit.position.y - hotspot.position.y) ** 2
      );
      if (dist < closestDist) {
        closestDist = dist;
        closestUnit = unit;
      }
    }

    if (closestDist > 8 && closestUnit) {
      // Suggest moving CRAC closer
      const midX = (closestUnit.position.x + hotspot.position.x) / 2;
      const midY = (closestUnit.position.y + hotspot.position.y) / 2;
      suggestions.push({
        type: 'move_crac',
        description: `Move ${closestUnit.name} closer to hotspot area. Current distance: ${closestDist.toFixed(1)}m`,
        impact: 8,
        position: { x: midX, y: midY, z: closestUnit.position.z },
        parameters: { unitIndex: input.hvacUnits.findIndex((u) => u.id === closestUnit.id) },
      });
    }
  }

  // Check airflow balance
  const totalCooling = input.hvacUnits.reduce((s, u) => s + u.capacityKW, 0);
  const totalHeat = input.racks.reduce((s, r) => s + r.powerKW, 0);

  if (totalCooling < totalHeat * 1.2) {
    suggestions.push({
      type: 'adjust_airflow',
      description: `Cooling deficit detected. Total cooling: ${totalCooling.toFixed(0)}kW vs heat load: ${totalHeat.toFixed(0)}kW. Need ${((totalHeat * 1.2) - totalCooling).toFixed(0)}kW more capacity.`,
      impact: 20,
      parameters: { additionalCapacityKW: totalHeat * 1.2 - totalCooling },
    });
  }

  return suggestions;
}

function cloneInput(input: SimulationInput): SimulationInput {
  return {
    ...input,
    config: { ...input.config },
    racks: input.racks.map((rack) => ({
      ...rack,
      position: { ...rack.position },
    })),
    hvacUnits: input.hvacUnits.map((unit) => ({
      ...unit,
      position: { ...unit.position },
    })),
    tiles: input.tiles.map((tile) => ({ ...tile })),
  };
}

function applySuggestion(input: SimulationInput, suggestion: OptimizationSuggestion): SimulationInput {
  const next = cloneInput(input);

  if (suggestion.type === 'add_tile' && suggestion.position) {
    const gridX = Math.floor(suggestion.position.x / input.config.gridResolution);
    const gridY = Math.floor(suggestion.position.y / input.config.gridResolution);
    const newTile: PerforatedTile = {
      x: gridX,
      y: gridY,
      openArea: suggestion.parameters?.openArea || 0.25,
      tileSize: 0.6,
    };
    next.tiles = [...next.tiles.filter((tile) => !(tile.x === newTile.x && tile.y === newTile.y)), newTile];
    return next;
  }

  if (suggestion.type === 'remove_tile' && suggestion.position) {
    const gridX = Math.floor(suggestion.position.x / input.config.gridResolution);
    const gridY = Math.floor(suggestion.position.y / input.config.gridResolution);
    next.tiles = next.tiles.filter((tile) => !(tile.x === gridX && tile.y === gridY));
    return next;
  }

  if (suggestion.type === 'move_crac' && suggestion.position) {
    const indexed = typeof suggestion.parameters?.unitIndex === 'number'
      ? Math.floor(suggestion.parameters.unitIndex)
      : -1;
    const candidateIndex = indexed >= 0 && indexed < next.hvacUnits.length
      ? indexed
      : next.hvacUnits.findIndex((unit) => unit.type === 'crac' || unit.type === 'crah');

    if (candidateIndex >= 0) {
      next.hvacUnits = next.hvacUnits.map((unit, idx) => idx === candidateIndex
        ? { ...unit, position: { ...suggestion.position! } }
        : unit);
    }

    return next;
  }

  if (suggestion.type === 'adjust_airflow') {
    const additionalCapacity = suggestion.parameters?.additionalCapacityKW || 0;
    if (additionalCapacity > 0 && next.hvacUnits.length > 0) {
      const perUnitDelta = additionalCapacity / next.hvacUnits.length;
      next.hvacUnits = next.hvacUnits.map((unit) => {
        const nextCapacity = unit.capacityKW + perUnitDelta;
        return {
          ...unit,
          capacityKW: Math.max(0.5, nextCapacity),
          capacityTR: Math.max(0.1, nextCapacity / 3.517),
          airflowCFM: Math.max(200, Math.round(unit.airflowCFM * (1 + (perUnitDelta / Math.max(1, unit.capacityKW)) * 0.5))),
        };
      });
    }

    return next;
  }

  if (suggestion.type === 'rearrange_racks') {
    const sorted: ServerRack[] = [...next.racks]
      .sort((a, b) => (b.powerKW - a.powerKW))
      .map((rack, index) => ({
        ...rack,
        position: {
          ...rack.position,
          x: rack.position.x + (index % 2 === 0 ? 0.8 : -0.8),
          y: rack.position.y + (index % 3 === 0 ? 0.6 : -0.6),
        },
      }));

    next.racks = sorted;
    return next;
  }

  return next;
}

// ─── Rack Layout Optimization ───────────────────────────────────────

function optimizeRackLayout(
  input: SimulationInput,
  baseMetrics: SimulationMetrics
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  // Check for racks with high inlet temperatures
  const hotRacks = baseMetrics.rackInletTemps
    .filter(r => r.maxTemp > 30)
    .sort((a, b) => b.maxTemp - a.maxTemp);

  if (hotRacks.length > 0) {
    suggestions.push({
      type: 'rearrange_racks',
      description: `${hotRacks.length} rack(s) with inlet temps above 30°C. Consider hot/cold aisle containment or relocating high-density racks near CRAC units.`,
      impact: 12,
    });
  }

  // Check rack density distribution
  const highDensityRacks = input.racks.filter(r => r.powerKW > 10);
  if (highDensityRacks.length > 0) {
    // Check if high-density racks are clustered
    for (let i = 0; i < highDensityRacks.length; i++) {
      for (let j = i + 1; j < highDensityRacks.length; j++) {
        const dist = Math.sqrt(
          (highDensityRacks[i].position.x - highDensityRacks[j].position.x) ** 2 +
          (highDensityRacks[i].position.y - highDensityRacks[j].position.y) ** 2
        );
        if (dist < 2) {
          suggestions.push({
            type: 'rearrange_racks',
            description: `High-density racks "${highDensityRacks[i].name}" and "${highDensityRacks[j].name}" are only ${dist.toFixed(1)}m apart. Distribute to prevent heat concentration.`,
            impact: 10,
          });
          break;
        }
      }
    }
  }

  return suggestions;
}

// ─── Main Optimization Runner ───────────────────────────────────────

export function runOptimization(
  input: SimulationInput,
  config: OptimizationConfig = {
    targets: [{ type: 'minimize_hotspots', weight: 0.6 }, { type: 'minimize_pue', weight: 0.2 }, { type: 'balance_airflow', weight: 0.2 }],
    maxIterations: 5,
    adjustableTiles: true,
    adjustableCRAC: true,
    adjustableRacks: true,
  }
): OptimizationResult {
  // Run baseline simulation
  const baseResult = runCFDSimulation(input);
  const baseScore = computeScore(baseResult.metrics, config);

  // Collect suggestions from each optimizer
  const allSuggestions: OptimizationSuggestion[] = [];

  if (config.adjustableTiles) {
    allSuggestions.push(...optimizeTiles(input, baseResult.metrics));
  }
  if (config.adjustableCRAC) {
    allSuggestions.push(...optimizeCRAC(input, baseResult.metrics));
  }
  if (config.adjustableRacks) {
    allSuggestions.push(...optimizeRackLayout(input, baseResult.metrics));
  }

  // Sort by impact
  allSuggestions.sort((a, b) => b.impact - a.impact);

  const maxTries = Math.min(Math.max(0, config.maxIterations), allSuggestions.length);
  const history: OptimizationIteration[] = [
    {
      iteration: 0,
      score: baseScore,
      maxTemperature: baseResult.metrics.maxTemperature,
      hotspotCount: baseResult.metrics.hotspots.length,
      pue: baseResult.metrics.pue,
      accepted: true,
      suggestionDescription: 'Baseline',
    },
  ];

  let bestInput = cloneInput(input);
  let bestResult = baseResult;
  let bestScore = baseScore;
  let bestIteration = 0;

  for (let i = 0; i < maxTries; i++) {
    const suggestion = allSuggestions[i];
    const trialInput = applySuggestion(bestInput, suggestion);
    const trialResult = runCFDSimulation(trialInput);
    const trialScore = computeScore(trialResult.metrics, config);
    const accepted = trialScore < bestScore;

    history.push({
      iteration: i + 1,
      score: trialScore,
      maxTemperature: trialResult.metrics.maxTemperature,
      hotspotCount: trialResult.metrics.hotspots.length,
      pue: trialResult.metrics.pue,
      accepted,
      suggestionType: suggestion.type,
      suggestionDescription: suggestion.description,
    });

    if (accepted) {
      bestInput = trialInput;
      bestResult = trialResult;
      bestScore = trialScore;
      bestIteration = i + 1;
    }
  }

  const improvementBase = Math.max(1, Math.abs(baseScore));
  const improvement = ((baseScore - bestScore) / improvementBase) * 100;

  return {
    initialMetrics: baseResult.metrics,
    optimizedMetrics: bestResult.metrics,
    suggestions: allSuggestions,
    improvement: Math.round(improvement * 10) / 10,
    iterations: maxTries,
    initialScore: Math.round(baseScore * 1000) / 1000,
    optimizedScore: Math.round(bestScore * 1000) / 1000,
    bestIteration,
    optimizationHistory: history,
  };
}

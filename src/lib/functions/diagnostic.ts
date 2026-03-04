/**
 * HVAC Diagnostic Engine
 * Comprehensive fault analysis for air-conditioning systems.
 *
 * Correlates airflow behaviour, refrigeration cycle thermodynamics and
 * humidity control to diagnose faults, inefficiencies and uneven comfort
 * conditions.  Output is ranked by probability and severity.
 */

import { v4 as uuid } from 'uuid';
import type {
  DiagnosticInput,
  DiagnosticResult,
  DiagnosticFault,
  DiagnosticSymptom,
  DiagnosticStep,
  CorrectiveAction,
  FaultDomain,
  Severity,
  ConfidenceLevel,
} from '@/types/diagnostic';

// ── helpers ──────────────────────────────────────────────────────────────

function faultId() { return uuid().slice(0, 8); }

function scoreProbability(base: number, input: DiagnosticInput): number {
  // Adjust base probability (0-100) by available evidence
  let s = base;
  if (input.iceFormation) s += 8;
  if (input.weakAirflow) s += 5;
  if (input.highHumidity) s += 3;
  if (input.shortCycling) s += 4;
  if (input.noisyOperation) s += 2;
  // Cap
  return Math.min(s, 100);
}

function probabilityLabel(score: number): ConfidenceLevel {
  if (score >= 80) return 'very_high';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function severityFromScore(score: number): Severity {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'moderate';
  return 'low';
}

// ── Fault library ────────────────────────────────────────────────────────

function buildDirtyCoilFault(input: DiagnosticInput): DiagnosticFault {
  const prob = scoreProbability(82, input);
  return {
    id: faultId(),
    rank: 1,
    title: 'Dirty or Obstructed Evaporator Coil',
    domain: 'airflow',
    probability: probabilityLabel(prob),
    severity: severityFromScore(prob),
    mechanismDescription:
      'Accumulated dirt, dust or biological growth on the evaporator coil increases thermal resistance non-uniformly. Sections with heavier fouling experience reduced convective heat-transfer coefficients while cleaner sections absorb heat normally, creating a temperature gradient across the coil face.',
    refrigerationCycleEffect:
      'Fouled circuits absorb less heat, causing local suction temperature to drop and potentially sub-cooling refrigerant in those tubes. The compressor may see fluctuating suction pressure and reduced overall capacity.',
    airflowEffect:
      'Dirt accumulation raises the local pressure drop across the affected coil section. Air diverts preferentially through cleaner fin surfaces, reducing face velocity on the dirty side and increasing it on the clean side.',
    whyCoolingIsUneven:
      'The side nearest the return-air entry or the bottom of a vertical coil accumulates more debris. The clean side delivers more air at a warmer temperature (reduced contact time); the dirty side delivers less air but is over-cooled, resulting in felt temperature asymmetry at the vents.',

    symptoms: [
      { category: 'supply_vent', description: 'Temperature differential exceeds 3 °C across supply outlets', severity: 'moderate' },
      { category: 'visual', description: 'Visible dirt or discolouration on coil face (uneven pattern)', severity: 'moderate' },
      { category: 'visual', description: 'Uneven condensate pattern on drain pan', severity: 'low' },
      { category: 'performance', description: 'Increased compressor runtime with reduced cooling output', severity: 'moderate' },
    ],

    diagnosticSteps: [
      { order: 1, phase: 'visual_inspection', instruction: 'Remove filter and inspect evaporator coil face with flashlight.', expectedResult: 'Identify sections with heavy dirt, matted lint, or biological growth.', invasive: false },
      { order: 2, phase: 'airflow_verification', instruction: 'Measure supply air temperature on both sides of discharge using IR thermometer.', expectedResult: 'ΔT difference > 3 °C between left and right sides indicates uneven coil loading.', toolRequired: 'IR thermometer', invasive: false },
      { order: 3, phase: 'refrigeration_check', instruction: 'Compare suction line temperature at coil outlet to saturated suction temp from gauge set.', expectedResult: 'Superheat may be erratic or asymmetric if measured at multiple points.', toolRequired: 'Manifold gauge set + pipe clamp thermocouple', invasive: false },
    ],

    correctiveActions: [
      { action: 'Chemical coil cleaning with non-acid foaming cleaner; flush condensate drain', repairLevel: 'maintenance', costLevel: 'low', estimatedTime: '45–60 min' },
      { action: 'Install or upgrade air filter to MERV-8 or higher to prevent recurrence', repairLevel: 'maintenance', costLevel: 'low' },
      { action: 'Establish preventive maintenance schedule (coil cleaning every 6–12 months)', repairLevel: 'maintenance', costLevel: 'low' },
    ],
  };
}

function buildCloggedFilterFault(input: DiagnosticInput): DiagnosticFault {
  const prob = scoreProbability(78, input);
  return {
    id: faultId(),
    rank: 2,
    title: 'Clogged or Collapsed Air Filter',
    domain: 'airflow',
    probability: probabilityLabel(prob),
    severity: severityFromScore(prob),
    mechanismDescription:
      'A severely restricted filter reduces total airflow across the evaporator. The reduced mass-flow rate means the coil absorbs less total heat, driving surface temperature below dew-point and eventually below 0 °C. If the filter is partially clogged, airflow becomes asymmetric before reaching the coil.',
    refrigerationCycleEffect:
      'Reduced airflow lowers evaporator pressure and temperature. Superheat increases initially; if ice forms the situation reverses as liquid flood-back can occur. Suction pressure drops 5–15 psi below normal.',
    airflowEffect:
      'Static pressure upstream of the coil increases on the restricted side. The blower draws more air from the less-restricted path, producing uneven face velocity across the coil.',
    whyCoolingIsUneven:
      'The side with adequate airflow delivers cooled air normally. The restricted side delivers minimal volume — perceived as weak or warm airflow at the vent because total BTU delivery is insufficient despite low temperature.',

    symptoms: [
      { category: 'supply_vent', description: 'Weak airflow at all or most supply vents', severity: 'moderate' },
      { category: 'visual', description: 'Filter visibly loaded with dust (>50 % occlusion)', severity: 'high' },
      { category: 'visual', description: 'Ice beginning to form on suction line or coil edges', severity: 'high' },
      { category: 'performance', description: 'System runs continuously without satisfying set-point', severity: 'moderate' },
    ],

    diagnosticSteps: [
      { order: 1, phase: 'visual_inspection', instruction: 'Remove air filter and hold up to light source.', expectedResult: 'If light is significantly blocked (>50 %), filter is clogged.', invasive: false },
      { order: 2, phase: 'airflow_verification', instruction: 'With filter removed, measure supply air velocity and compare to filtered condition.', expectedResult: 'If velocity increases >25 % without filter, filter restriction confirmed.', toolRequired: 'Anemometer', invasive: false },
      { order: 3, phase: 'airflow_verification', instruction: 'Measure static pressure drop across filter.', expectedResult: 'Pressure drop > 0.20 in. w.g. indicates excessive restriction.', toolRequired: 'Manometer', invasive: false },
    ],

    correctiveActions: [
      { action: 'Replace disposable filter or clean washable filter', repairLevel: 'maintenance', costLevel: 'low', estimatedTime: '5–10 min' },
      { action: 'Establish filter replacement schedule: every 30–90 days depending on environment', repairLevel: 'maintenance', costLevel: 'low' },
    ],
  };
}

function buildPartialFreezeFault(input: DiagnosticInput): DiagnosticFault {
  const prob = scoreProbability(input.iceFormation ? 88 : 62, input);
  return {
    id: faultId(),
    rank: 3,
    title: 'Partial Evaporator Coil Freezing',
    domain: 'combined',
    probability: probabilityLabel(prob),
    severity: 'high',
    mechanismDescription:
      'Ice formation on one section of the evaporator insulates the coil surface from the airstream. The frozen section maintains ~0 °C surface temperature but transfers negligible heat because ice (k ≈ 2.2 W/m·K) acts as a growing insulator. The unfrozen section operates at 5–10 °C and delivers all effective cooling.',
    refrigerationCycleEffect:
      'Refrigerant in frozen circuits cannot absorb latent heat effectively, returning to the compressor with abnormally low superheat — or as liquid in severe cases. Suction pressure drops. The compressor works harder but cooling capacity is reduced because effective coil area is lost.',
    airflowEffect:
      'Ice physically blocks airflow through the frozen section. All airflow and effective cooling shift to the ice-free portion of the coil.',
    whyCoolingIsUneven:
      'One side of the coil is frozen solid (no air passes); the other side delivers concentrated cooling. Supply vent temperatures differ by 5–10 °C or more between affected and unaffected sides.',

    symptoms: [
      { category: 'supply_vent', description: 'No airflow from one side; cold air from the other', severity: 'high' },
      { category: 'visual', description: 'Visible ice on evaporator coil surface or suction line', severity: 'critical' },
      { category: 'visual', description: 'Excessive condensate or water dripping once ice melts', severity: 'moderate' },
      { category: 'mechanical', description: 'Hissing or gurgling sounds from evaporator', severity: 'moderate' },
      { category: 'performance', description: 'Compressor runs continuously, system unable to reach set-point', severity: 'high' },
    ],

    diagnosticSteps: [
      { order: 1, phase: 'visual_inspection', instruction: 'Open access panel and inspect evaporator coil for ice accumulation.', expectedResult: 'Ice on one section of the coil or entire suction line confirms freezing.', invasive: false },
      { order: 2, phase: 'refrigeration_check', instruction: 'Switch system to FAN ONLY for 15-20 min to defrost, then measure suction pressure.', expectedResult: 'After defrost, if suction pressure is low (<55 psi for R-410A, <58 psi for R-32), low charge or restriction is the root cause.', toolRequired: 'Manifold gauge set', invasive: false },
      { order: 3, phase: 'airflow_verification', instruction: 'After defrost, measure airflow. If adequate — root cause is refrigerant. If low — root cause is airflow restriction.', expectedResult: 'Distinguish between airflow-induced and refrigerant-induced freezing.', invasive: false },
    ],

    correctiveActions: [
      { action: 'Defrost coil by running fan-only mode; do NOT scrape ice', repairLevel: 'maintenance', costLevel: 'low', estimatedTime: '20–30 min' },
      { action: 'Identify and correct root cause: dirty filter, low charge, or failed TXV', repairLevel: 'component_repair', costLevel: 'moderate' },
      { action: 'If TXV is stuck or sensing bulb has lost charge — replace TXV', repairLevel: 'component_repair', costLevel: 'moderate', safetyNote: 'Requires certified refrigerant handling', estimatedTime: '2–3 hours' },
    ],
  };
}

function buildLowChargeFault(input: DiagnosticInput): DiagnosticFault {
  let prob = scoreProbability(60, input);
  // Boost if we have superheat data showing high values
  if (input.superheat !== undefined && input.superheat > 15) prob += 15;
  if (input.suctionPressure !== undefined && input.suctionPressure < 100) prob += 10;
  const p = Math.min(prob, 100);

  return {
    id: faultId(),
    rank: 4,
    title: 'Low Refrigerant Charge / Refrigerant Leak',
    domain: 'refrigeration',
    probability: probabilityLabel(p),
    severity: 'high',
    mechanismDescription:
      'Insufficient refrigerant mass means the evaporator cannot be fully saturated. Liquid refrigerant entering the metering device flashes into vapour earlier in the coil circuit. The first section (nearest the inlet) receives two-phase mixture and absorbs heat normally; downstream circuits receive mostly superheated vapour with drastically lower heat-absorption capacity.',
    refrigerationCycleEffect:
      'Suction pressure drops below normal. Superheat at the suction line rises significantly (>12–15 °F above normal). Sub-cooling at the liquid line is low or near zero. The evaporator operates in a "starved" condition.',
    airflowEffect:
      'Airflow may be unaffected mechanically, but air passing over the starved coil circuits exits near ambient temperature instead of being cooled.',
    whyCoolingIsUneven:
      'The refrigerant distributor feeds multiple circuits from a common inlet. With low charge, only the first circuits receive enough liquid to evaporate. Remaining circuits carry superheated gas and contribute no cooling. Air over active circuits exits cold; air over starved circuits exits warm.',

    symptoms: [
      { category: 'supply_vent', description: 'One side delivers cold air; opposite side at or near ambient temperature', severity: 'high' },
      { category: 'visual', description: 'Oil stains at flare fittings or braised joints (leak indicators)', severity: 'high' },
      { category: 'visual', description: 'Reduced or absent condensate flow despite humid conditions', severity: 'moderate' },
      { category: 'performance', description: 'Compressor short-cycles on high-pressure or overload protection', severity: 'high' },
      { category: 'electrical', description: 'Compressor current draw below normal due to reduced load', severity: 'moderate' },
    ],

    diagnosticSteps: [
      { order: 1, phase: 'visual_inspection', instruction: 'Inspect all flare connections, service valves and braised joints for oil residue.', expectedResult: 'Oil stains at joints indicate probable refrigerant leak location.', invasive: false },
      { order: 2, phase: 'refrigeration_check', instruction: 'Connect manifold gauges. Read suction and discharge pressures. Calculate superheat and sub-cooling.', expectedResult: 'Low suction pressure, high superheat (>15 °F), low sub-cooling (<5 °F) confirm undercharge.', toolRequired: 'Manifold gauge set + thermocouple', invasive: false },
      { order: 3, phase: 'refrigeration_check', instruction: 'Perform electronic leak detection on all accessible joints, coil connections and service valve cores.', expectedResult: 'Leak detector alarm identifies specific leak location.', toolRequired: 'Electronic leak detector', invasive: false },
      { order: 4, phase: 'refrigeration_check', instruction: 'If no leak found, perform nitrogen pressure test (150–400 psi depending on system).', expectedResult: 'Pressure drop over 30 min confirms hidden leak.', toolRequired: 'Nitrogen cylinder + regulator', invasive: true },
    ],

    correctiveActions: [
      { action: 'Locate and repair leak (brazing, fitting replacement, or valve core replacement)', repairLevel: 'component_repair', costLevel: 'moderate', safetyNote: 'Refrigerant handling requires EPA 608 certification or local equivalent', estimatedTime: '1–3 hours' },
      { action: 'Evacuate system, pressure-test, and recharge to manufacturer specification', repairLevel: 'major_repair', costLevel: 'moderate', safetyNote: 'Never vent refrigerant — recover into approved cylinder', estimatedTime: '2–4 hours' },
      { action: 'If evaporator coil leak — replace evaporator coil', repairLevel: 'major_repair', costLevel: 'high', estimatedTime: '4–8 hours' },
    ],
  };
}

function buildBlowerFault(input: DiagnosticInput): DiagnosticFault {
  let prob = scoreProbability(45, input);
  if (input.noisyOperation) prob += 12;
  if (input.motorAmps !== undefined && input.ratedAmps !== undefined && input.motorAmps < input.ratedAmps * 0.75) prob += 15;
  if (input.capacitorMicrofarads !== undefined && input.ratedCapacitorMicrofarads !== undefined) {
    const ratio = input.capacitorMicrofarads / input.ratedCapacitorMicrofarads;
    if (ratio < 0.90) prob += 18;
  }
  const p = Math.min(prob, 100);

  return {
    id: faultId(),
    rank: 5,
    title: 'Blower Motor Degradation or Weak Run Capacitor',
    domain: 'airflow',
    probability: probabilityLabel(p),
    severity: severityFromScore(p),
    mechanismDescription:
      'A failing run capacitor reduces motor starting and running torque, lowering RPM and total CFM. An imbalanced, warped or slipping blower wheel produces asymmetric air delivery — one side of the scroll housing generates higher velocity than the other.',
    refrigerationCycleEffect:
      'With reduced total airflow, evaporator temperature drops. The coil may begin to freeze if airflow drops below ~350 CFM per ton. Suction pressure decreases and superheat becomes erratic.',
    airflowEffect:
      'Centrifugal blowers rely on uniform wheel geometry and correct rotational speed. A degraded motor or imbalanced wheel creates uneven face velocity across the coil, producing asymmetric heat absorption.',
    whyCoolingIsUneven:
      'The high-velocity side delivers more air with less temperature drop; the low-velocity side delivers less air at a lower temperature but with insufficient volume to effectively cool the served zone.',

    symptoms: [
      { category: 'supply_vent', description: 'Uneven air velocity across supply vents', severity: 'moderate' },
      { category: 'mechanical', description: 'Rattling, wobbling, or vibration from blower housing', severity: 'moderate' },
      { category: 'electrical', description: 'Motor amp draw below nameplate rating', severity: 'moderate' },
      { category: 'electrical', description: 'Motor housing excessively hot (winding degradation)', severity: 'high' },
      { category: 'performance', description: 'Gradual loss of cooling performance over weeks/months', severity: 'moderate' },
    ],

    diagnosticSteps: [
      { order: 1, phase: 'airflow_verification', instruction: 'Measure supply air velocity at each register or at each side of the discharge.', expectedResult: 'Velocity difference >30 % side-to-side indicates blower imbalance.', toolRequired: 'Anemometer', invasive: false },
      { order: 2, phase: 'electrical_test', instruction: 'Measure blower motor run capacitor capacitance with HVAC-rated multimeter.', expectedResult: 'Capacitance >5 % below nameplate rating = replace capacitor.', toolRequired: 'Capacitance meter', invasive: false },
      { order: 3, phase: 'electrical_test', instruction: 'Measure motor running amps and compare to nameplate FLA.', expectedResult: 'Amps significantly below FLA with low speed = motor degradation or capacitor failure.', toolRequired: 'Clamp meter', invasive: false },
      { order: 4, phase: 'visual_inspection', instruction: 'Inspect blower wheel: check set screw, look for cracks, dirt build-up, or wobble.', expectedResult: 'Loose set screw, cracked hub, or heavy uneven dirt on blades.', invasive: false },
    ],

    correctiveActions: [
      { action: 'Replace run capacitor with exact OEM-rated replacement', repairLevel: 'component_repair', costLevel: 'low', estimatedTime: '15–20 min', safetyNote: 'Discharge capacitor before handling' },
      { action: 'Clean and rebalance blower wheel; re-tighten set screw', repairLevel: 'maintenance', costLevel: 'low', estimatedTime: '30–45 min' },
      { action: 'Replace blower motor if windings are degraded', repairLevel: 'component_repair', costLevel: 'moderate', estimatedTime: '1–2 hours' },
      { action: 'Verify motor speed tap matches design CFM requirement', repairLevel: 'maintenance', costLevel: 'low', estimatedTime: '10 min' },
    ],
  };
}

function buildDuctFault(input: DiagnosticInput): DiagnosticFault {
  let prob = input.systemType === 'ducted' || input.systemType === 'central' ? scoreProbability(55, input) : 15;
  if (input.cfmMeasured !== undefined && input.cfmDesign !== undefined && input.cfmMeasured < input.cfmDesign * 0.8) prob += 15;
  const p = Math.min(prob, 100);

  return {
    id: faultId(),
    rank: 6,
    title: 'Duct Restriction, Leakage, or Airflow Imbalance',
    domain: 'airflow',
    probability: probabilityLabel(p),
    severity: severityFromScore(p),
    mechanismDescription:
      'In ducted systems, uneven cooling at supply registers is caused by collapsed flexible duct sections, disconnected joints leaking conditioned air into ceiling cavities, undersized branch ducts, or excessive equivalent duct length creating high static pressure on one run.',
    refrigerationCycleEffect:
      'If total system airflow is maintained, refrigeration cycle performance remains near-normal. If the restricted duct causes total airflow reduction (fan rides up the static curve), evaporator temperature may drop.',
    airflowEffect:
      'The restricted duct run delivers reduced CFM. Unrestricted runs receive excess air and deliver marginally warmer supply temperature due to lower ΔT across the coil. Total system balance is lost.',
    whyCoolingIsUneven:
      'The zone served by the restricted duct receives insufficient conditioned air volume. Other zones are over-served. Temperature differences of 3–6 °C between zones are typical.',

    symptoms: [
      { category: 'supply_vent', description: 'One or more registers deliver significantly weaker airflow than others', severity: 'moderate' },
      { category: 'visual', description: 'Collapsed or kinked flex duct visible in ceiling/crawl space', severity: 'high' },
      { category: 'visual', description: 'Disconnected duct joint with visible gap', severity: 'high' },
      { category: 'performance', description: 'Temperature stratification between zones exceeds 3 °C', severity: 'moderate' },
    ],

    diagnosticSteps: [
      { order: 1, phase: 'airflow_verification', instruction: 'Measure CFM at each supply register using flow hood or anemometer.', expectedResult: 'Compare measured CFM to design CFM per register. Deficit >20 % on specific registers = duct issue.', toolRequired: 'Flow hood or anemometer', invasive: false },
      { order: 2, phase: 'duct_inspection', instruction: 'Visually inspect all accessible ductwork for disconnections, kinks, crushed sections, or missing insulation.', expectedResult: 'Identify physical damage or disconnection points.', invasive: false },
      { order: 3, phase: 'airflow_verification', instruction: 'Measure total system static pressure at supply and return plenums.', expectedResult: 'Total external static exceeding equipment rating (typically > 0.5 in. w.g. for residential) = restriction.', toolRequired: 'Manometer', invasive: false },
    ],

    correctiveActions: [
      { action: 'Reconnect or replace damaged flexible duct sections', repairLevel: 'maintenance', costLevel: 'low', estimatedTime: '30–60 min' },
      { action: 'Seal duct joints with mastic or UL 181-rated tape', repairLevel: 'maintenance', costLevel: 'low', estimatedTime: '1–2 hours' },
      { action: 'Add balancing dampers at branch take-offs to equalize airflow', repairLevel: 'component_repair', costLevel: 'moderate', estimatedTime: '2–4 hours' },
      { action: 'Resize undersized branch ducts per ACCA Manual D', repairLevel: 'redesign', costLevel: 'high', estimatedTime: '1–2 days' },
    ],
  };
}

function buildDamperFault(input: DiagnosticInput): DiagnosticFault {
  const isDucted = input.systemType === 'ducted' || input.systemType === 'central';
  const prob = isDucted ? scoreProbability(35, input) : 5;

  return {
    id: faultId(),
    rank: 7,
    title: 'Malfunctioning Dampers or Zoning Actuators',
    domain: 'controls',
    probability: probabilityLabel(prob),
    severity: 'moderate',
    mechanismDescription:
      'Zone dampers that are stuck closed, partially closed, or with failed actuators prevent conditioned air from reaching the affected zone. A bypass damper stuck open may dump cooled air back to the return plenum.',
    refrigerationCycleEffect:
      'If a damper closes off airflow to a large zone, total airflow may decrease, lowering evaporator temperature. If only a small zone is affected, refrigeration cycle remains largely normal but energy is wasted.',
    airflowEffect:
      'Blocked zone receives zero or minimal conditioned air while other zones are over-served. Return air from the blocked zone re-enters the system at higher temperature, slightly increasing mixed-air temperature.',
    whyCoolingIsUneven:
      'The zone with the stuck damper receives no conditioned air delivery. The thermostat in the un-served zone never satisfies, causing prolonged compressor runtime and over-cooling of served zones.',

    symptoms: [
      { category: 'supply_vent', description: 'Zero or very low airflow from one zone while others have strong flow', severity: 'high' },
      { category: 'mechanical', description: 'Damper actuator does not respond to thermostat call', severity: 'moderate' },
      { category: 'visual', description: 'Damper blade visible in closed position through register', severity: 'moderate' },
      { category: 'performance', description: 'Prolonged compressor runtime; un-served zone never reaches set-point', severity: 'moderate' },
    ],

    diagnosticSteps: [
      { order: 1, phase: 'visual_inspection', instruction: 'Verify each zone damper position: manually check blade orientation at duct take-offs.', expectedResult: 'Damper blade stuck closed or partially closed in affected zone.', invasive: false },
      { order: 2, phase: 'electrical_test', instruction: 'Check actuator motor for 24 VAC signal when zone calls for cooling.', expectedResult: 'No voltage = control board or thermostat issue. Voltage present but no movement = failed actuator.', toolRequired: 'Multimeter', invasive: false },
      { order: 3, phase: 'visual_inspection', instruction: 'Inspect zone control board for error LEDs or fault codes.', expectedResult: 'Error code identifies faulty zone or communication issue.', invasive: false },
    ],

    correctiveActions: [
      { action: 'Replace failed actuator motor', repairLevel: 'component_repair', costLevel: 'moderate', estimatedTime: '30–60 min' },
      { action: 'Recalibrate zone control board; reset and re-commission zones', repairLevel: 'maintenance', costLevel: 'low', estimatedTime: '30 min' },
      { action: 'Replace stuck or corroded damper blade assembly', repairLevel: 'component_repair', costLevel: 'moderate', estimatedTime: '1–2 hours' },
    ],
  };
}

function buildDesignFault(input: DiagnosticInput): DiagnosticFault {
  const prob = scoreProbability(20, input);

  return {
    id: faultId(),
    rank: 8,
    title: 'Poor System Design or Improper Duct Sizing',
    domain: 'design',
    probability: probabilityLabel(prob),
    severity: 'moderate',
    mechanismDescription:
      'Undersized trunk ducts, improperly located return-air paths, or excessive equivalent duct length create permanent airflow imbalance. This is a design fault — not a maintenance issue — and produces chronic uneven cooling present since installation.',
    refrigerationCycleEffect:
      'The refrigeration cycle may operate within normal parameters. The fault is in air distribution, not refrigerant management. However, if the design causes total airflow to fall below 350 CFM/ton, coil freezing secondary effects can occur.',
    airflowEffect:
      'Certain zones consistently receive less airflow than the ACCA Manual D design target. Static pressure in undersized runs exceeds 0.08 in. w.g. per 100 ft, and air preferentially flows to lower-resistance paths.',
    whyCoolingIsUneven:
      'The system was never designed to deliver equal cooling to all zones. Zones with undersized ducts, excessive run lengths, or too many fittings receive insufficient CFM and are chronically under-cooled.',

    symptoms: [
      { category: 'supply_vent', description: 'Chronic uneven temperatures across zones since system installation', severity: 'moderate' },
      { category: 'visual', description: 'Undersized ducts visible in accessible sections', severity: 'moderate' },
      { category: 'performance', description: 'Poor comfort despite equipment operating within normal parameters', severity: 'moderate' },
    ],

    diagnosticSteps: [
      { order: 1, phase: 'duct_inspection', instruction: 'Measure duct dimensions at trunk and each branch. Compare to ACCA Manual D requirements for the load served.', expectedResult: 'Branch ducts undersized by >20 % for the CFM required.', toolRequired: 'Tape measure', invasive: false },
      { order: 2, phase: 'airflow_verification', instruction: 'Perform total system airflow measurement (fan curve or duct traverse) and per-register measurement.', expectedResult: 'Total system airflow may be adequate, but distribution is imbalanced.', toolRequired: 'Flow hood or pitot tube', invasive: false },
      { order: 3, phase: 'airflow_verification', instruction: 'Calculate total equivalent length of each duct run including fittings. Compare to maximum recommended.', expectedResult: 'Excessive equivalent length on under-performing runs.', invasive: false },
    ],

    correctiveActions: [
      { action: 'Perform ACCA Manual D duct design calculation for the full system', repairLevel: 'redesign', costLevel: 'moderate', estimatedTime: '4–8 hours (engineering)' },
      { action: 'Resize trunk and branch ducts to match calculated load requirements', repairLevel: 'redesign', costLevel: 'high', estimatedTime: '2–5 days' },
      { action: 'Add supplemental split unit for chronically under-served zone', repairLevel: 'redesign', costLevel: 'high', estimatedTime: '1–2 days' },
    ],
  };
}

function buildSensorFault(input: DiagnosticInput): DiagnosticFault {
  let prob = scoreProbability(15, input);
  if (input.shortCycling) prob += 10;
  const p = Math.min(prob, 100);

  return {
    id: faultId(),
    rank: 9,
    title: 'Control or Temperature Sensor Error',
    domain: 'controls',
    probability: probabilityLabel(p),
    severity: 'moderate',
    mechanismDescription:
      'A faulty return-air sensor, thermostat in an atypical microclimate (near a window or heat source), or defective control board relay can cause premature compressor cycling, fan speed errors, or incorrect damper positioning.',
    refrigerationCycleEffect:
      'Short cycling prevents the evaporator coil from reaching steady-state operation. The coil never fully wets, reducing latent capacity. Superheat and sub-cooling fluctuate with every cycle.',
    airflowEffect:
      'If the fan speed is incorrectly commanded (e.g., low speed when high is needed), total airflow is reduced system-wide. If fan cycles with compressor instead of running continuously, temperature recovery is poor.',
    whyCoolingIsUneven:
      'Premature compressor shut-off means the system never runs long enough to distribute cooling evenly. Zones closer to the air handler cool first; distant zones lag behind and feel warm.',

    symptoms: [
      { category: 'performance', description: 'Erratic on/off cycling; system never reaches set-point steadily', severity: 'moderate' },
      { category: 'supply_vent', description: 'Intermittent cold then warm air in rapid succession', severity: 'moderate' },
      { category: 'electrical', description: 'Thermostat displays incorrect temperature vs actual room temp', severity: 'low' },
    ],

    diagnosticSteps: [
      { order: 1, phase: 'electrical_test', instruction: 'Compare thermostat reading to a calibrated hand-held thermometer placed at the same location.', expectedResult: 'Deviation > 2 °F / 1 °C = sensor error.', toolRequired: 'Calibrated thermometer', invasive: false },
      { order: 2, phase: 'electrical_test', instruction: 'Monitor compressor cycle times. Normal minimum on-time is 8–10 minutes.', expectedResult: 'Cycle on-time < 5 min = short cycling.', toolRequired: 'Stopwatch', invasive: false },
      { order: 3, phase: 'electrical_test', instruction: 'If applicable, check return-air sensor resistance (NTC thermistor) against manufacturer resistance-temperature chart.', expectedResult: 'Out-of-spec reading confirms sensor failure.', toolRequired: 'Multimeter', invasive: false },
    ],

    correctiveActions: [
      { action: 'Recalibrate or replace thermostat / return-air sensor', repairLevel: 'component_repair', costLevel: 'low', estimatedTime: '15–30 min' },
      { action: 'Relocate thermostat away from heat sources / direct sunlight', repairLevel: 'maintenance', costLevel: 'low', estimatedTime: '30–60 min' },
      { action: 'Replace control board if relay or logic failure confirmed', repairLevel: 'component_repair', costLevel: 'moderate', estimatedTime: '1–2 hours' },
    ],
  };
}

// ── Delta-T analyzer ─────────────────────────────────────────────────────

function analyzeDeltaT(input: DiagnosticInput) {
  if (input.returnAirTemp === undefined || (input.supplyTempCold === undefined && input.supplyTempWarm === undefined)) {
    return undefined;
  }

  const supplyAvg = input.supplyTempCold !== undefined && input.supplyTempWarm !== undefined
    ? (input.supplyTempCold + input.supplyTempWarm) / 2
    : (input.supplyTempCold ?? input.supplyTempWarm)!;

  const measured = input.returnAirTemp - supplyAvg;
  const expectedMin = 8;
  const expectedMax = 12;

  return {
    measured: Math.round(measured * 10) / 10,
    expected: { min: expectedMin, max: expectedMax },
    status: measured < expectedMin ? 'low' as const : measured > expectedMax ? 'high' as const : 'normal' as const,
  };
}

// ── SHR analyzer ─────────────────────────────────────────────────────────

function analyzeSHR(input: DiagnosticInput) {
  if (input.indoorRH === undefined) return undefined;

  // Estimated SHR based on indoor RH and system type
  // In high-humidity climates (PH), typical SHR is 0.70–0.80
  let estimatedSHR: number;
  if (input.indoorRH > 70) estimatedSHR = 0.62;
  else if (input.indoorRH > 60) estimatedSHR = 0.72;
  else if (input.indoorRH > 50) estimatedSHR = 0.80;
  else estimatedSHR = 0.88;

  let status: 'normal' | 'high_latent' | 'low_latent';
  let interpretation: string;

  if (estimatedSHR < 0.70) {
    status = 'high_latent';
    interpretation = 'System is handling a high latent load. Moisture removal is dominant, which may reduce perceived sensible cooling. Indoor RH is elevated — the coil is working harder on dehumidification than temperature pull-down.';
  } else if (estimatedSHR > 0.85) {
    status = 'low_latent';
    interpretation = 'System is primarily providing sensible cooling with minimal dehumidification. If indoor humidity is high, the coil surface temperature may be above the air dew point — check airflow rate (excessive CFM prevents proper dehumidification).';
  } else {
    status = 'normal';
    interpretation = 'Sensible-to-latent heat ratio is within normal range for tropical/humid climates. The system is providing balanced cooling and dehumidification.';
  }

  return {
    value: Math.round(estimatedSHR * 100) / 100,
    status,
    interpretation,
  };
}

// ── Main diagnostic function ─────────────────────────────────────────────

export function runDiagnostic(input: DiagnosticInput): DiagnosticResult {
  // Build all applicable faults
  const faults: DiagnosticFault[] = [
    buildDirtyCoilFault(input),
    buildCloggedFilterFault(input),
    buildPartialFreezeFault(input),
    buildLowChargeFault(input),
    buildBlowerFault(input),
    buildDuctFault(input),
    buildDamperFault(input),
    buildDesignFault(input),
    buildSensorFault(input),
  ];

  // Filter out very-low-probability faults for non-applicable systems
  const applicableFaults = faults.filter((f) => {
    if (f.domain === 'controls' && f.title.includes('Damper') && input.systemType !== 'ducted' && input.systemType !== 'central') {
      return false; // damper faults don't apply to split/window
    }
    return true;
  });

  // Re-rank based on actual probability scores
  const probabilityOrder: Record<ConfidenceLevel, number> = { very_high: 4, high: 3, medium: 2, low: 1 };
  applicableFaults.sort((a, b) => {
    const diff = probabilityOrder[b.probability] - probabilityOrder[a.probability];
    if (diff !== 0) return diff;
    return a.rank - b.rank;
  });
  applicableFaults.forEach((f, i) => { f.rank = i + 1; });

  // Determine primary fault domain
  const topFault = applicableFaults[0];
  const primaryDomain: FaultDomain = topFault?.domain ?? 'airflow';

  // Delta-T and SHR
  const deltaT = analyzeDeltaT(input);
  const shr = analyzeSHR(input);

  // Build summary
  const summaryTitle = 'Uneven Cooling Distribution — Multi-Domain Analysis';
  const summaryDescription =
    `The system is producing refrigeration effect but failing to distribute it uniformly. ` +
    `Analysis identified ${applicableFaults.length} potential faults across airflow, refrigeration, and control domains. ` +
    `The most probable root cause is "${topFault?.title}" (${topFault?.probability} confidence). ` +
    (deltaT ? `Measured ΔT is ${deltaT.measured} °C (expected ${deltaT.expected.min}–${deltaT.expected.max} °C, status: ${deltaT.status}). ` : '') +
    (shr ? `Estimated SHR is ${shr.value} (${shr.status}). ` : '') +
    `Diagnosis should follow a cost-priority sequence: verify filters and airflow first, inspect coil and blower second, evaluate refrigerant charge third.`;

  const clientExplanation =
    'Your air conditioner is working — it is producing cold air — but it is not distributing that cold air evenly across the space. ' +
    'The most likely reason is an airflow issue: a dirty coil, clogged filter, or mechanical component that is preventing air from flowing equally through the system. ' +
    'A qualified technician can diagnose the exact cause with a routine inspection and measurement, and most fixes are straightforward maintenance tasks.';

  // Immediate and preventive actions
  const immediateActions = [
    'Check and replace the air filter if dirty or >90 days old',
    'Verify all supply and return vents are open and unobstructed',
    'Measure supply air temperature at both sides of the unit to quantify the imbalance',
    'Listen for unusual sounds: hissing (leak), rattling (blower), or gurgling (flood-back)',
  ];

  const preventiveActions = [
    'Replace air filter every 30–90 days based on environment',
    'Schedule professional coil cleaning every 6–12 months',
    'Annual refrigerant pressure and superheat/sub-cooling check',
    'Inspect ductwork integrity annually (ducted systems)',
    'Verify blower capacitor and motor amp draw at each annual service',
  ];

  return {
    id: uuid(),
    timestamp: new Date().toISOString(),
    systemType: input.systemType,
    applicationType: input.applicationType,
    primaryDomain,
    summaryTitle,
    summaryDescription,
    clientExplanation,
    deltaT,
    sensibleHeatRatio: shr,
    faults: applicableFaults,
    immediateActions,
    preventiveActions,
  };
}

/**
 * HVAC Diagnostic Types
 * Type definitions for the comprehensive HVAC diagnostic analysis system.
 */

// ── System input types ───────────────────────────────────────────────────

export type SystemType = 'split' | 'window' | 'ducted' | 'central' | 'vrf';
export type ApplicationType = 'residential' | 'light_commercial' | 'commercial';
export type FaultDomain = 'airflow' | 'refrigeration' | 'humidity' | 'controls' | 'design' | 'combined';
export type Severity = 'low' | 'moderate' | 'high' | 'critical';
export type CostLevel = 'low' | 'moderate' | 'high';
export type RepairLevel = 'maintenance' | 'component_repair' | 'major_repair' | 'redesign';
export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'very_high';

export interface DiagnosticInput {
  // System info
  systemType: SystemType;
  applicationType: ApplicationType;
  refrigerantType?: string | undefined;           // R32, R410A, R22 etc.
  systemAgeDays?: number | undefined;

  // Symptom description
  symptomDescription: string;
  unevenCooling: boolean;             // cold one side, warm other
  weakAirflow: boolean;
  highHumidity: boolean;
  noisyOperation: boolean;
  iceFormation: boolean;
  shortCycling: boolean;
  highEnergyBills: boolean;

  // Measurements (optional — field technician data)
  supplyTempCold?: number | undefined;            // °C at cold side
  supplyTempWarm?: number | undefined;            // °C at warm side
  returnAirTemp?: number | undefined;             // °C
  outdoorTemp?: number | undefined;               // °C
  indoorRH?: number | undefined;                  // %
  suctionPressure?: number | undefined;           // psi
  dischargePressure?: number | undefined;         // psi
  superheat?: number | undefined;                 // °F or °C delta
  subcooling?: number | undefined;                // °F or °C delta
  motorAmps?: number | undefined;                 // Amps
  ratedAmps?: number | undefined;                 // Amps (nameplate)
  capacitorMicrofarads?: number | undefined;      // µF measured
  ratedCapacitorMicrofarads?: number | undefined; // µF nameplate

  // Duct (ducted systems)
  staticPressureSupply?: number | undefined;      // in. w.g.
  staticPressureReturn?: number | undefined;      // in. w.g.
  cfmMeasured?: number | undefined;
  cfmDesign?: number | undefined;

  // Maintenance history
  lastFilterChange?: string | undefined;          // ISO date
  lastCoilCleaning?: string | undefined;          // ISO date
  lastRefrigerantService?: string | undefined;    // ISO date
}

// ── Diagnostic output types ──────────────────────────────────────────────

export interface DiagnosticFault {
  id: string;
  rank: number;
  title: string;
  domain: FaultDomain;
  probability: ConfidenceLevel;
  severity: Severity;

  // Technical explanation
  mechanismDescription: string;          // How the fault occurs physically
  refrigerationCycleEffect: string;      // Impact on the refrigeration cycle
  airflowEffect: string;                 // Impact on air distribution
  whyCoolingIsUneven: string;            // Direct explanation of the symptom

  // Observable symptoms
  symptoms: DiagnosticSymptom[];

  // Field diagnostics
  diagnosticSteps: DiagnosticStep[];

  // Corrective actions
  correctiveActions: CorrectiveAction[];
}

export interface DiagnosticSymptom {
  category: 'supply_vent' | 'visual' | 'electrical' | 'mechanical' | 'performance';
  description: string;
  severity: Severity;
}

export interface DiagnosticStep {
  order: number;
  phase: 'visual_inspection' | 'airflow_verification' | 'refrigeration_check' | 'electrical_test' | 'duct_inspection' | 'humidity_check';
  instruction: string;
  expectedResult: string;
  toolRequired?: string;
  invasive: boolean;
}

export interface CorrectiveAction {
  action: string;
  repairLevel: RepairLevel;
  costLevel: CostLevel;
  safetyNote?: string;
  estimatedTime?: string;
}

export interface DiagnosticResult {
  id: string;
  timestamp: string;
  systemType: SystemType;
  applicationType: ApplicationType;

  // Summary
  primaryDomain: FaultDomain;
  summaryTitle: string;
  summaryDescription: string;
  clientExplanation: string;

  // Delta-T analysis
  deltaT?: {
    measured: number;
    expected: { min: number; max: number };
    status: 'normal' | 'low' | 'high';
  } | undefined;

  // SHR analysis
  sensibleHeatRatio?: {
    value: number;
    status: 'normal' | 'high_latent' | 'low_latent';
    interpretation: string;
  } | undefined;

  // Ranked faults
  faults: DiagnosticFault[];

  // Quick recommendations
  immediateActions: string[];
  preventiveActions: string[];
}

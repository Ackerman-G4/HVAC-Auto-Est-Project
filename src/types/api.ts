/**
 * Unified API response and DTO types for all panel-to-API contracts.
 */

// ── Envelope ─────────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T;
  meta?: { count?: number; page?: number; pageSize?: number };
}

export interface ApiError {
  error: string;
  details?: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ── Project list item (shared across dashboard, projects list, quotation, reports) ──

export interface ProjectListItem {
  id: string;
  name: string;
  clientName: string;
  location: string;
  buildingType: string;
  status: string;
  totalFloorArea: number;
  floorsAboveGrade: number;
  createdAt: string;
  updatedAt: string;
  floorCount: number;
  roomCount: number;
  equipmentCount: number;
  boqItemCount: number;
  totalCoolingLoad: number;
}

// ── Settings ─────────────────────────────────────────────────────────────

export interface AppSettings {
  companyName: string;
  companyLogo: string;
  currency: string;
  defaultSafetyFactor: number;
  defaultDiversityFactor: number;
  defaultOutdoorDB: number;
  defaultOutdoorWB: number;
  defaultIndoorDB: number;
  defaultIndoorRH: number;
  laborRate: number;
  overheadPercent: number;
  contingencyPercent: number;
  vatPercent: number;
  [key: string]: unknown;
}

// ── Diagnostic history ───────────────────────────────────────────────────

export interface DiagnosticHistoryItem {
  id: string;
  systemType: string;
  faultCount: number;
  maxSeverity: string;
  createdAt: string;
}

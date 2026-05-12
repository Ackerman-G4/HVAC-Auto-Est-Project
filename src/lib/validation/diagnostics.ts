import { z } from 'zod';

const MAX_TEXT = 4000;
const MAX_REFRIGERANT = 32;
const MAX_DATE_TEXT = 64;

const optionalDateTextSchema = z.string().trim().max(MAX_DATE_TEXT).optional();

const optionalMeasurementSchema = z.number().finite().min(-1000).max(1000).optional();

export const diagnosticsRequestSchema = z
  .object({
    systemType: z.enum(['split', 'window', 'ducted', 'central', 'vrf']),
    applicationType: z.enum(['residential', 'light_commercial', 'commercial']).optional(),
    refrigerantType: z.string().trim().max(MAX_REFRIGERANT).optional(),
    systemAgeDays: z.number().int().min(0).max(36500).optional(),
    symptomDescription: z.string().trim().max(MAX_TEXT).optional(),
    unevenCooling: z.boolean().optional(),
    weakAirflow: z.boolean().optional(),
    highHumidity: z.boolean().optional(),
    noisyOperation: z.boolean().optional(),
    iceFormation: z.boolean().optional(),
    shortCycling: z.boolean().optional(),
    highEnergyBills: z.boolean().optional(),
    supplyTempCold: optionalMeasurementSchema,
    supplyTempWarm: optionalMeasurementSchema,
    returnAirTemp: optionalMeasurementSchema,
    outdoorTemp: optionalMeasurementSchema,
    indoorRH: z.number().finite().min(0).max(100).optional(),
    suctionPressure: z.number().finite().min(0).max(1000).optional(),
    dischargePressure: z.number().finite().min(0).max(2000).optional(),
    superheat: optionalMeasurementSchema,
    subcooling: optionalMeasurementSchema,
    motorAmps: z.number().finite().min(0).max(2000).optional(),
    ratedAmps: z.number().finite().min(0).max(2000).optional(),
    capacitorMicrofarads: z.number().finite().min(0).max(5000).optional(),
    ratedCapacitorMicrofarads: z.number().finite().min(0).max(5000).optional(),
    staticPressureSupply: optionalMeasurementSchema,
    staticPressureReturn: optionalMeasurementSchema,
    cfmMeasured: z.number().finite().min(0).max(300000).optional(),
    cfmDesign: z.number().finite().min(0).max(300000).optional(),
    lastFilterChange: optionalDateTextSchema,
    lastCoilCleaning: optionalDateTextSchema,
    lastRefrigerantService: optionalDateTextSchema,
  })
  .strict();

export function getDiagnosticsValidationError(error: z.ZodError): string {
  return error.issues[0]?.message || 'Invalid diagnostics request payload';
}

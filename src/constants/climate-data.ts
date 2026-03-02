// Philippine City Design Conditions
// Source: ASHRAE Fundamentals, Chapter 14 - Climatic Design Information 
// Values: 0.4% cooling design conditions

export interface ClimateData {
  city: string;
  province: string;
  region: string;
  latitude: number;
  longitude: number;
  altitude: number; // meters
  outdoorDB: number; // °C dry-bulb 0.4% cooling
  outdoorWB: number; // °C wet-bulb
  dailyRange: number; // °C mean daily range
}

export const PHILIPPINE_CLIMATE_DATA: ClimateData[] = [
  // NCR - National Capital Region
  { city: 'Manila', province: 'Metro Manila', region: 'NCR', latitude: 14.58, longitude: 120.98, altitude: 15, outdoorDB: 35.0, outdoorWB: 27.0, dailyRange: 8.0 },
  { city: 'Quezon City', province: 'Metro Manila', region: 'NCR', latitude: 14.65, longitude: 121.03, altitude: 50, outdoorDB: 34.8, outdoorWB: 27.0, dailyRange: 8.5 },
  { city: 'Makati', province: 'Metro Manila', region: 'NCR', latitude: 14.55, longitude: 121.03, altitude: 15, outdoorDB: 35.0, outdoorWB: 27.0, dailyRange: 8.0 },
  { city: 'Taguig', province: 'Metro Manila', region: 'NCR', latitude: 14.52, longitude: 121.07, altitude: 15, outdoorDB: 35.0, outdoorWB: 27.0, dailyRange: 8.0 },
  { city: 'Pasig', province: 'Metro Manila', region: 'NCR', latitude: 14.58, longitude: 121.07, altitude: 15, outdoorDB: 35.0, outdoorWB: 27.0, dailyRange: 8.0 },
  { city: 'Mandaluyong', province: 'Metro Manila', region: 'NCR', latitude: 14.58, longitude: 121.03, altitude: 15, outdoorDB: 35.0, outdoorWB: 27.0, dailyRange: 8.0 },
  { city: 'Parañaque', province: 'Metro Manila', region: 'NCR', latitude: 14.48, longitude: 121.02, altitude: 5, outdoorDB: 35.0, outdoorWB: 27.2, dailyRange: 7.8 },
  { city: 'Pasay', province: 'Metro Manila', region: 'NCR', latitude: 14.55, longitude: 121.00, altitude: 5, outdoorDB: 35.0, outdoorWB: 27.2, dailyRange: 7.8 },
  { city: 'Caloocan', province: 'Metro Manila', region: 'NCR', latitude: 14.65, longitude: 120.97, altitude: 10, outdoorDB: 35.0, outdoorWB: 27.0, dailyRange: 8.2 },
  { city: 'Valenzuela', province: 'Metro Manila', region: 'NCR', latitude: 14.70, longitude: 120.97, altitude: 10, outdoorDB: 35.0, outdoorWB: 27.0, dailyRange: 8.2 },
  { city: 'Las Piñas', province: 'Metro Manila', region: 'NCR', latitude: 14.45, longitude: 121.00, altitude: 5, outdoorDB: 35.0, outdoorWB: 27.0, dailyRange: 8.0 },
  { city: 'Muntinlupa', province: 'Metro Manila', region: 'NCR', latitude: 14.40, longitude: 121.05, altitude: 20, outdoorDB: 34.8, outdoorWB: 27.0, dailyRange: 8.5 },

  // Region III - Central Luzon
  { city: 'San Fernando', province: 'Pampanga', region: 'Region III', latitude: 15.03, longitude: 120.68, altitude: 10, outdoorDB: 35.5, outdoorWB: 27.0, dailyRange: 9.0 },
  { city: 'Angeles', province: 'Pampanga', region: 'Region III', latitude: 15.15, longitude: 120.58, altitude: 60, outdoorDB: 35.2, outdoorWB: 27.0, dailyRange: 9.5 },
  { city: 'Malolos', province: 'Bulacan', region: 'Region III', latitude: 14.85, longitude: 120.82, altitude: 5, outdoorDB: 35.2, outdoorWB: 27.0, dailyRange: 8.5 },
  { city: 'Meycauayan', province: 'Bulacan', region: 'Region III', latitude: 14.73, longitude: 120.95, altitude: 5, outdoorDB: 35.2, outdoorWB: 27.0, dailyRange: 8.5 },
  { city: 'Olongapo', province: 'Zambales', region: 'Region III', latitude: 14.83, longitude: 120.28, altitude: 5, outdoorDB: 34.5, outdoorWB: 27.0, dailyRange: 8.0 },

  // Region IV-A - CALABARZON
  { city: 'Antipolo', province: 'Rizal', region: 'Region IV-A', latitude: 14.58, longitude: 121.17, altitude: 200, outdoorDB: 33.5, outdoorWB: 26.5, dailyRange: 9.0 },
  { city: 'Bacoor', province: 'Cavite', region: 'Region IV-A', latitude: 14.45, longitude: 120.93, altitude: 5, outdoorDB: 35.0, outdoorWB: 27.0, dailyRange: 8.0 },
  { city: 'Imus', province: 'Cavite', region: 'Region IV-A', latitude: 14.40, longitude: 120.93, altitude: 10, outdoorDB: 35.0, outdoorWB: 27.0, dailyRange: 8.0 },
  { city: 'Dasmariñas', province: 'Cavite', region: 'Region IV-A', latitude: 14.33, longitude: 120.93, altitude: 30, outdoorDB: 34.8, outdoorWB: 27.0, dailyRange: 8.5 },
  { city: 'Calamba', province: 'Laguna', region: 'Region IV-A', latitude: 14.20, longitude: 121.17, altitude: 100, outdoorDB: 34.0, outdoorWB: 26.8, dailyRange: 9.0 },
  { city: 'San Pablo', province: 'Laguna', region: 'Region IV-A', latitude: 14.07, longitude: 121.32, altitude: 100, outdoorDB: 34.0, outdoorWB: 26.8, dailyRange: 9.0 },
  { city: 'Santa Rosa', province: 'Laguna', region: 'Region IV-A', latitude: 14.31, longitude: 121.11, altitude: 50, outdoorDB: 34.5, outdoorWB: 27.0, dailyRange: 8.5 },
  { city: 'Batangas City', province: 'Batangas', region: 'Region IV-A', latitude: 13.75, longitude: 121.05, altitude: 10, outdoorDB: 34.5, outdoorWB: 27.0, dailyRange: 8.5 },
  { city: 'Lipa', province: 'Batangas', region: 'Region IV-A', latitude: 13.93, longitude: 121.15, altitude: 300, outdoorDB: 33.0, outdoorWB: 26.0, dailyRange: 9.5 },

  // Visayas
  { city: 'Cebu City', province: 'Cebu', region: 'Region VII', latitude: 10.32, longitude: 123.90, altitude: 10, outdoorDB: 34.5, outdoorWB: 27.0, dailyRange: 7.5 },
  { city: 'Mandaue', province: 'Cebu', region: 'Region VII', latitude: 10.33, longitude: 123.93, altitude: 5, outdoorDB: 34.5, outdoorWB: 27.0, dailyRange: 7.5 },
  { city: 'Lapu-Lapu', province: 'Cebu', region: 'Region VII', latitude: 10.31, longitude: 123.97, altitude: 5, outdoorDB: 34.2, outdoorWB: 27.0, dailyRange: 7.0 },
  { city: 'Iloilo City', province: 'Iloilo', region: 'Region VI', latitude: 10.72, longitude: 122.57, altitude: 5, outdoorDB: 34.5, outdoorWB: 27.2, dailyRange: 7.5 },
  { city: 'Bacolod', province: 'Negros Occidental', region: 'Region VI', latitude: 10.68, longitude: 122.97, altitude: 5, outdoorDB: 34.5, outdoorWB: 27.2, dailyRange: 7.5 },
  { city: 'Tacloban', province: 'Leyte', region: 'Region VIII', latitude: 11.25, longitude: 125.00, altitude: 5, outdoorDB: 34.0, outdoorWB: 27.0, dailyRange: 7.0 },
  { city: 'Dumaguete', province: 'Negros Oriental', region: 'Region VII', latitude: 9.30, longitude: 123.30, altitude: 5, outdoorDB: 34.0, outdoorWB: 27.0, dailyRange: 7.5 },

  // Mindanao
  { city: 'Davao City', province: 'Davao del Sur', region: 'Region XI', latitude: 7.07, longitude: 125.60, altitude: 15, outdoorDB: 34.0, outdoorWB: 26.5, dailyRange: 8.0 },
  { city: 'Cagayan de Oro', province: 'Misamis Oriental', region: 'Region X', latitude: 8.48, longitude: 124.65, altitude: 10, outdoorDB: 34.0, outdoorWB: 27.0, dailyRange: 7.5 },
  { city: 'Zamboanga City', province: 'Zamboanga del Sur', region: 'Region IX', latitude: 6.92, longitude: 122.08, altitude: 5, outdoorDB: 34.0, outdoorWB: 27.0, dailyRange: 7.0 },
  { city: 'General Santos', province: 'South Cotabato', region: 'Region XII', latitude: 6.12, longitude: 125.17, altitude: 20, outdoorDB: 34.0, outdoorWB: 26.5, dailyRange: 8.0 },
  { city: 'Butuan', province: 'Agusan del Norte', region: 'Region XIII', latitude: 8.95, longitude: 125.53, altitude: 10, outdoorDB: 34.0, outdoorWB: 27.0, dailyRange: 7.5 },
  { city: 'Cotabato City', province: 'Maguindanao', region: 'BARMM', latitude: 7.22, longitude: 124.25, altitude: 5, outdoorDB: 34.5, outdoorWB: 27.0, dailyRange: 8.0 },

  // Northern Luzon
  { city: 'Baguio', province: 'Benguet', region: 'CAR', latitude: 16.42, longitude: 120.58, altitude: 1500, outdoorDB: 27.0, outdoorWB: 22.0, dailyRange: 10.0 },
  { city: 'Dagupan', province: 'Pangasinan', region: 'Region I', latitude: 16.05, longitude: 120.33, altitude: 5, outdoorDB: 35.5, outdoorWB: 27.5, dailyRange: 9.0 },
  { city: 'Laoag', province: 'Ilocos Norte', region: 'Region I', latitude: 18.20, longitude: 120.60, altitude: 5, outdoorDB: 34.5, outdoorWB: 27.0, dailyRange: 9.0 },
  { city: 'Tuguegarao', province: 'Cagayan', region: 'Region II', latitude: 17.62, longitude: 121.73, altitude: 30, outdoorDB: 36.0, outdoorWB: 27.5, dailyRange: 10.0 },
  { city: 'Santiago', province: 'Isabela', region: 'Region II', latitude: 16.68, longitude: 121.55, altitude: 100, outdoorDB: 35.0, outdoorWB: 27.0, dailyRange: 9.5 },
];

// Default indoor design conditions for Philippine HVAC
export const DEFAULT_INDOOR_CONDITIONS = {
  temperature: 24, // °C
  relativeHumidity: 50, // %
  airVelocity: 0.25, // m/s
};

export function getClimateData(city: string): ClimateData | undefined {
  return PHILIPPINE_CLIMATE_DATA.find(
    (c) => c.city.toLowerCase() === city.toLowerCase()
  );
}

export function getCityOptions(): { value: string; label: string }[] {
  return PHILIPPINE_CLIMATE_DATA.map((c) => ({
    value: c.city,
    label: `${c.city}, ${c.province}`,
  })).sort((a, b) => a.label.localeCompare(b.label));
}

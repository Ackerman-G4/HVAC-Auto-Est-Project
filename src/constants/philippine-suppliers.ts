// Philippine HVAC Suppliers Directory

export interface SupplierData {
  name: string;
  type: 'national' | 'regional' | 'local';
  website: string;
  location: string;
  contactInfo: string;
  coverageArea: string;
  categories: string[];
}

export const PHILIPPINE_SUPPLIERS: SupplierData[] = [
  // ==================== NATIONAL - Equipment Manufacturers ====================
  {
    name: 'Daikin Philippines',
    type: 'national',
    website: 'https://www.daikin.com.ph',
    location: 'Makati City, Metro Manila',
    contactInfo: '+63 2 8893 2200',
    coverageArea: 'Nationwide',
    categories: ['wall_split', 'ceiling_cassette', 'ducted_split', 'vrf'],
  },
  {
    name: 'Carrier Philippines (Concepcion Industrial)',
    type: 'national',
    website: 'https://www.carrier.com/commercial/en/ph/',
    location: 'Mandaluyong City, Metro Manila',
    contactInfo: '+63 2 8635 0901',
    coverageArea: 'Nationwide',
    categories: ['wall_split', 'ceiling_cassette', 'ducted_split', 'chiller', 'ahu'],
  },
  {
    name: 'Samsung Climate Solutions PH',
    type: 'national',
    website: 'https://www.samsung.com/ph/business/climate/',
    location: 'Taguig City, Metro Manila',
    contactInfo: '+63 2 8422 2000',
    coverageArea: 'Nationwide',
    categories: ['wall_split', 'ceiling_cassette', 'vrf'],
  },
  {
    name: 'Mitsubishi Electric Philippines',
    type: 'national',
    website: 'https://www.mitsubishielectric.com.ph',
    location: 'Makati City, Metro Manila',
    contactInfo: '+63 2 8816 0725',
    coverageArea: 'Nationwide',
    categories: ['wall_split', 'ceiling_cassette', 'ducted_split', 'vrf'],
  },
  {
    name: 'Panasonic Philippines',
    type: 'national',
    website: 'https://www.panasonic.com/ph',
    location: 'Pasig City, Metro Manila',
    contactInfo: '+63 2 8635 7777',
    coverageArea: 'Nationwide',
    categories: ['wall_split', 'ceiling_cassette'],
  },
  {
    name: 'LG Philippines',
    type: 'national',
    website: 'https://www.lg.com/ph/business',
    location: 'Taguig City, Metro Manila',
    contactInfo: '+63 2 8902 5400',
    coverageArea: 'Nationwide',
    categories: ['wall_split', 'ceiling_cassette', 'vrf'],
  },
  {
    name: 'Koppel (Concepcion Industrial)',
    type: 'national',
    website: 'https://www.koppel.ph',
    location: 'Mandaluyong City, Metro Manila',
    contactInfo: '+63 2 8635 0901',
    coverageArea: 'Nationwide',
    categories: ['wall_split', 'ceiling_cassette'],
  },
  {
    name: 'Condura (Concepcion Industrial)',
    type: 'national',
    website: 'https://www.condura.com.ph',
    location: 'Mandaluyong City, Metro Manila',
    contactInfo: '+63 2 8635 0901',
    coverageArea: 'Nationwide',
    categories: ['wall_split'],
  },

  // ==================== NATIONAL - Material Retailers ====================
  {
    name: 'Wilcon Depot',
    type: 'national',
    website: 'https://www.wilcon.com.ph',
    location: 'Multiple Branches Nationwide',
    contactInfo: '+63 2 8878 5000',
    coverageArea: 'Nationwide (70+ branches)',
    categories: ['refrigerant_pipe', 'pipe_insulation', 'pvc_pipe', 'electrical_wire', 'hanger_support', 'misc'],
  },
  {
    name: 'Citi Hardware',
    type: 'national',
    website: 'https://www.citihardware.com',
    location: 'Multiple Branches Nationwide',
    contactInfo: 'Various per branch',
    coverageArea: 'Nationwide (100+ branches)',
    categories: ['refrigerant_pipe', 'pipe_insulation', 'pvc_pipe', 'electrical_wire', 'electrical_breaker', 'hanger_support', 'misc'],
  },
  {
    name: 'HMR Trading',
    type: 'national',
    website: 'https://www.hmr.ph',
    location: 'Multiple Branches',
    contactInfo: '+63 2 8756 0000',
    coverageArea: 'Luzon, Visayas',
    categories: ['misc', 'controls', 'electrical_accessory'],
  },
  {
    name: 'All Home',
    type: 'national',
    website: 'https://www.allhome.com.ph',
    location: 'Multiple Branches Nationwide',
    contactInfo: '+63 2 8888 7777',
    coverageArea: 'Nationwide (40+ branches)',
    categories: ['pvc_pipe', 'electrical_wire', 'electrical_breaker', 'misc'],
  },
  {
    name: 'True Value Hardware',
    type: 'national',
    website: 'https://www.truevalue.com.ph',
    location: 'Multiple Branches',
    contactInfo: 'Various per branch',
    coverageArea: 'Metro Manila, Central Luzon, CALABARZON',
    categories: ['electrical_wire', 'electrical_breaker', 'hanger_support', 'misc'],
  },
  {
    name: 'Handyman Do It Best',
    type: 'national',
    website: 'https://www.handyman.com.ph',
    location: 'Multiple Branches',
    contactInfo: 'Various per branch',
    coverageArea: 'Nationwide',
    categories: ['pvc_pipe', 'electrical_wire', 'misc'],
  },

  // ==================== REGIONAL - ACR Specialists ====================
  {
    name: 'CDO Refrigeration & Parts',
    type: 'regional',
    website: '',
    location: 'Quezon City, Metro Manila',
    contactInfo: '+63 2 8371 5000',
    coverageArea: 'Luzon',
    categories: ['refrigerant_pipe', 'pipe_insulation', 'refrigerant', 'brazing', 'controls', 'duct_accessory'],
  },
  {
    name: 'Robaire Industrial Sales',
    type: 'regional',
    website: '',
    location: 'Quezon City, Metro Manila',
    contactInfo: '+63 2 8417 1601',
    coverageArea: 'Metro Manila, Luzon',
    categories: ['pipe_insulation', 'duct_accessory', 'hanger_support', 'controls'],
  },
  {
    name: 'JEA Steel Industries',
    type: 'regional',
    website: '',
    location: 'Valenzuela City, Metro Manila',
    contactInfo: '+63 2 8294 0900',
    coverageArea: 'Luzon',
    categories: ['gi_sheet', 'duct_accessory', 'hanger_support'],
  },
  {
    name: 'Philippine Iron Construction & Marine Works (PICMW)',
    type: 'regional',
    website: '',
    location: 'Quezon City, Metro Manila',
    contactInfo: '+63 2 8920 0100',
    coverageArea: 'Metro Manila',
    categories: ['gi_sheet', 'hanger_support'],
  },
  {
    name: 'Manila Lighterage Corp (Steel)',
    type: 'regional',
    website: '',
    location: 'Manila',
    contactInfo: '+63 2 8254 0000',
    coverageArea: 'Metro Manila, Central Luzon',
    categories: ['gi_sheet'],
  },

  // ==================== LOCAL - Specialty ACR Shops ====================
  {
    name: 'ACR Supply House',
    type: 'local',
    website: '',
    location: 'Banawe St., Quezon City',
    contactInfo: '+63 917 ***',
    coverageArea: 'NCR',
    categories: ['refrigerant_pipe', 'pipe_insulation', 'refrigerant', 'brazing', 'controls', 'misc'],
  },
  {
    name: 'Globe ACR Supply',
    type: 'local',
    website: '',
    location: 'Cebu City',
    contactInfo: '+63 932 ***',
    coverageArea: 'Cebu, Visayas',
    categories: ['refrigerant_pipe', 'pipe_insulation', 'refrigerant', 'brazing', 'controls'],
  },
  {
    name: 'Davao ACR & Industrial Supply',
    type: 'local',
    website: '',
    location: 'Davao City',
    contactInfo: '+63 922 ***',
    coverageArea: 'Davao, Mindanao',
    categories: ['refrigerant_pipe', 'pipe_insulation', 'refrigerant', 'brazing', 'controls'],
  },
];

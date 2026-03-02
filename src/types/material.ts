export type MaterialCategory =
  | 'refrigerant_pipe'
  | 'pipe_insulation'
  | 'refrigerant'
  | 'gi_sheet'
  | 'duct_insulation'
  | 'duct_accessory'
  | 'pvc_pipe'
  | 'electrical_wire'
  | 'electrical_breaker'
  | 'electrical_accessory'
  | 'hanger_support'
  | 'brazing'
  | 'controls'
  | 'misc';

export interface Material {
  id: string;
  category: MaterialCategory;
  name: string;
  specification: string;
  unit: string; // meter, piece, kg, sheet, roll, set
  unitPricePHP: number;
  supplierId?: string;
  supplier?: Supplier;
  lastUpdated: string;
}

export interface Supplier {
  id: string;
  name: string;
  type: 'national' | 'regional' | 'local';
  website: string;
  location: string;
  contactInfo: string;
  coverageArea: string;
  categories: MaterialCategory[];
}

export interface BOQItem {
  id: string;
  section: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  category: string;
  projectId?: string;
  specification?: string;
  notes?: string;
  floorName?: string;
}

export interface BOQSummary {
  items: BOQItem[];
  equipmentCost: number;
  materialCost: number;
  laborCost: number;
  overhead: number;
  contingency: number;
  subtotal: number;
  vat: number;
  grandTotal: number;
  costPerTR: number;
  alerts: CostAlert[];
  generatedAt: string;
}

export interface CostAlert {
  type: 'warning' | 'info' | 'error';
  message: string;
}

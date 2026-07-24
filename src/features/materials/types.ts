export interface MaterialItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  unitPricePHP: number;
  specification?: string;
  location?: string;
  supplierId?: string | null;
  supplier?: { id: string; name: string } | null;
}

export interface SupplierItem {
  id: string;
  name: string;
  type: string;
  location: string;
  contactInfo?: string;
  website?: string;
  categories?: string | string[];
  coverageArea?: string;
}

export interface MaterialFormState {
  name: string;
  category: string;
  unit: string;
  unitPricePHP: string;
  specification: string;
  location: string;
  supplierId: string;
}

export interface SupplierFormState {
  name: string;
  type: string;
  website: string;
  location: string;
  contactInfo: string;
  coverageArea: string;
  categories: string;
}

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'accent'
  | 'destructive'
  | 'success'
  | 'warning'
  | 'outline';

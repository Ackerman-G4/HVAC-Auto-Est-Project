import type { BadgeVariant, MaterialFormState, SupplierFormState } from './types';

export const defaultMaterialForm: MaterialFormState = {
  name: '',
  category: '',
  unit: 'pc',
  unitPricePHP: '0',
  specification: '',
  location: '',
  supplierId: '',
};

export const defaultSupplierForm: SupplierFormState = {
  name: '',
  type: '',
  website: '',
  location: '',
  contactInfo: '',
  coverageArea: '',
  categories: '',
};

export const CATEGORY_COLORS: Record<string, BadgeVariant> = {
  mechanical: 'accent',
  electrical: 'warning',
  piping: 'success',
  insulation: 'secondary',
  general: 'default',
};

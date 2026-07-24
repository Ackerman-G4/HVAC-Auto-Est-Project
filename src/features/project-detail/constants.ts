import type { PricingDraftState, RoomLoadDraftState } from './types';

export const SPACE_TYPES = [
  { value: 'office', label: 'Office' },
  { value: 'conference', label: 'Conference Room' },
  { value: 'lobby', label: 'Lobby' },
  { value: 'retail', label: 'Retail' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'hotel_room', label: 'Hotel Room' },
  { value: 'server_room', label: 'Server Room' },
  { value: 'corridor', label: 'Corridor' },
  { value: 'restroom', label: 'Restroom' },
  { value: 'storage', label: 'Storage' },
  { value: 'residential', label: 'Residential' },
  { value: 'classroom', label: 'Classroom' },
  { value: 'hospital_ward', label: 'Hospital Ward' },
  { value: 'operating_room', label: 'Operating Room' },
  { value: 'gym', label: 'Gym' },
  { value: 'theater', label: 'Theater' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'parking', label: 'Parking' },
];

export const WALL_TYPES = [
  { value: 'concrete_block_200mm', label: 'Concrete Block 200mm' },
  { value: 'concrete_block_150mm', label: 'Concrete Block 150mm' },
  { value: 'brick_wall_200mm', label: 'Brick Wall 200mm' },
  { value: 'drywall_metal_stud', label: 'Drywall Metal Stud' },
  { value: 'curtain_wall', label: 'Curtain Wall' },
  { value: 'precast_concrete_150mm', label: 'Precast Concrete 150mm' },
];

export const GLASS_TYPES = [
  { value: 'single_clear_6mm', label: 'Single Clear 6mm' },
  { value: 'single_tinted_6mm', label: 'Single Tinted 6mm' },
  { value: 'double_clear_6mm', label: 'Double Clear 6mm' },
  { value: 'double_tinted_6mm', label: 'Double Tinted 6mm' },
  { value: 'double_low_e', label: 'Double Low-E' },
  { value: 'triple_low_e', label: 'Triple Low-E' },
];

export const ORIENTATIONS = [
  { value: 'N', label: 'North' },
  { value: 'NE', label: 'Northeast' },
  { value: 'E', label: 'East' },
  { value: 'SE', label: 'Southeast' },
  { value: 'S', label: 'South' },
  { value: 'SW', label: 'Southwest' },
  { value: 'W', label: 'West' },
  { value: 'NW', label: 'Northwest' },
];

export const EMPTY_PRICING_DRAFT: PricingDraftState = {
  laborMultiplier: '',
  overheadPercent: '',
  contingencyPercent: '',
  vatRate: '',
};

export const EMPTY_ROOM_LOAD_DRAFT: RoomLoadDraftState = {
  tr: '',
  btu: '',
};

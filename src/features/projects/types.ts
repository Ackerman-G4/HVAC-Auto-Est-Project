/** Shared by the projects dashboard page and its extracted components. */
export interface ProjectListItem {
  id: string;
  name: string;
  clientName: string;
  buildingType: string;
  status: string;
  location: string;
  city: string;
  totalFloorArea: number;
  createdAt: string;
  updatedAt: string;
  floors: { rooms: { coolingLoad?: { trValue: number } | null }[] }[];
  _count: { selectedEquipment: number; boqItems: number };
}

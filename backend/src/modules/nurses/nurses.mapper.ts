import { Nurse } from './entities/nurse.entity';

export interface NurseListItem {
  id: string;
  name: string;
  phone: string;
  active: boolean;
}

export function toNurseListItem(nurse: Nurse): NurseListItem {
  return {
    id: nurse.id,
    name: nurse.user?.fullName || '',
    phone: nurse.user?.phone || '',
    active: nurse.isActive,
  };
}

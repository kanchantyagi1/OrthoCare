import { Doctor } from './entities/doctor.entity';

export interface DoctorListItem {
  id: string;
  name: string;
  phone: string;
  active: boolean;
}

export function toDoctorListItem(doctor: Doctor): DoctorListItem {
  return {
    id: doctor.id,
    name: doctor.user?.fullName || '',
    phone: doctor.user?.phone || '',
    active: doctor.isActive,
  };
}

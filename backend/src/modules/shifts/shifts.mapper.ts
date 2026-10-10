import { Shift } from './entities/shift.entity';

export interface ShiftListItem {
  id: string;
  doctorId: string;
  doctorName: string;
  label: string | null;
  /** Daily recurring window as "HH:mm" - deliberately NOT a datetime. */
  startTime: string;
  endTime: string;
}

export function toShiftListItem(shift: Shift): ShiftListItem {
  return {
    id: shift.id,
    doctorId: shift.doctorId,
    doctorName: shift.doctor?.user?.fullName || '',
    label: shift.label ?? null,
    startTime: shift.startTime,
    endTime: shift.endTime,
  };
}

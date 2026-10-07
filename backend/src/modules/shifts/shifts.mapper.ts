import { Shift } from './entities/shift.entity';

export interface ShiftListItem {
  id: string;
  nurseId: string;
  nurseName: string;
  label: string | null;
  /** Daily recurring window as "HH:mm" - deliberately NOT a datetime. */
  startTime: string;
  endTime: string;
}

export function toShiftListItem(shift: Shift): ShiftListItem {
  return {
    id: shift.id,
    nurseId: shift.nurseId,
    nurseName: shift.nurse?.user?.fullName || '',
    label: shift.label ?? null,
    startTime: shift.startTime,
    endTime: shift.endTime,
  };
}

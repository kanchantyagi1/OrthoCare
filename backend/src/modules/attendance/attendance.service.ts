import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance } from './entities/attendance.entity';
import { Nurse } from '../nurses/entities/nurse.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { PunchInDto } from './dto/punch-in.dto';
import { PunchOutDto } from './dto/punch-out.dto';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../../common/enums/audit-event.enum';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance) private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(Nurse) private readonly nurseRepo: Repository<Nurse>,
    @InjectRepository(Shift) private readonly shiftRepo: Repository<Shift>,
    private readonly audit: AuditService,
  ) {}

  private async findOpenAttendance(nurseId: string) {
    return this.attendanceRepo.findOne({ where: { nurseId, punchOut: null as any } });
  }

  async punchIn(nurseId: string, dto: PunchInDto, actorUserId?: string) {
    const existing = await this.findOpenAttendance(nurseId);
    if (existing) {
      // Idempotent: nurse is already punched in, do not create a duplicate.
      return { attendance: existing, duplicate: true };
    }

    if (dto.shiftId) {
      const shift = await this.shiftRepo.findOne({ where: { id: dto.shiftId, nurseId } });
      if (!shift) throw new BadRequestException('Shift does not belong to this nurse');
    }

    const attendance = this.attendanceRepo.create({
      nurseId,
      shiftId: dto.shiftId,
      punchIn: new Date(),
      deviceId: dto.deviceId,
    });
    const saved = await this.attendanceRepo.save(attendance);
    await this.audit.record(AuditEvent.PUNCH_IN, actorUserId, { nurseId, attendanceId: saved.id });
    return { attendance: saved, duplicate: false };
  }

  async punchOut(nurseId: string, dto: PunchOutDto, actorUserId?: string) {
    const existing = await this.findOpenAttendance(nurseId);
    if (!existing) {
      const last = await this.attendanceRepo.findOne({
        where: { nurseId },
        order: { punchIn: 'DESC' },
      });
      // Idempotent: nothing open to punch out of.
      return { attendance: last ?? null, duplicate: true };
    }

    existing.punchOut = new Date();
    if (dto.deviceId) existing.deviceId = dto.deviceId;
    const saved = await this.attendanceRepo.save(existing);
    await this.audit.record(AuditEvent.PUNCH_OUT, actorUserId, { nurseId, attendanceId: saved.id });
    return { attendance: saved, duplicate: false };
  }

  async today(nurseId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const open = await this.findOpenAttendance(nurseId);
    const records = await this.attendanceRepo
      .createQueryBuilder('a')
      .where('a.nurse_id = :nurseId', { nurseId })
      .andWhere('a.punch_in >= :startOfDay', { startOfDay })
      .orderBy('a.punch_in', 'DESC')
      .getMany();

    return { status: open ? 'ACTIVE' : 'OFFLINE', records };
  }

  /**
   * Section 28: finds a nurse who (1) has an assigned shift, (2) that shift is currently
   * active (now falls within its start/end time-of-day window), (3) has punched in,
   * (4) has not punched out, and (5) is active. Returns null (WAITING_FOR_NURSE) if none.
   */
  async getCurrentAvailableNurse(): Promise<Nurse | null> {
    const nowMinutes = this.currentMinutesOfDay();

    const openAttendance = await this.attendanceRepo
      .createQueryBuilder('a')
      .innerJoin(Nurse, 'n', 'n.id = a.nurse_id')
      .where('a.punch_out IS NULL')
      .andWhere('n.is_active = true')
      .orderBy('a.punch_in', 'ASC')
      .getMany();

    for (const attendance of openAttendance) {
      const shifts = await this.shiftRepo.find({
        where: { nurseId: attendance.nurseId, isActive: true },
      });
      const hasActiveShiftNow = shifts.some((shift) =>
        this.isWithinShiftWindow(nowMinutes, shift.startTime, shift.endTime),
      );
      if (hasActiveShiftNow) {
        return this.nurseRepo.findOne({ where: { id: attendance.nurseId } });
      }
    }

    return null;
  }

  private currentMinutesOfDay(): number {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  private isWithinShiftWindow(nowMinutes: number, startTime: string, endTime: string): boolean {
    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    if (start <= end) {
      return nowMinutes >= start && nowMinutes <= end;
    }
    // Overnight shift (e.g. 22:00 - 06:00)
    return nowMinutes >= start || nowMinutes <= end;
  }
}

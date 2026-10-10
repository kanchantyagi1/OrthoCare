import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Attendance } from './entities/attendance.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { PunchInDto } from './dto/punch-in.dto';
import { PunchOutDto } from './dto/punch-out.dto';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../../common/enums/audit-event.enum';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance) private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(Doctor) private readonly doctorRepo: Repository<Doctor>,
    @InjectRepository(Shift) private readonly shiftRepo: Repository<Shift>,
    private readonly audit: AuditService,
  ) {}

  /**
   * The open (not yet punched-out) attendance row, or null.
   *
   * MUST use IsNull(): a bare `punchOut: null` is not translated to `IS NULL` by
   * TypeORM, the condition is dropped, and this matched ANY attendance row for the
   * doctor. That made punch-in believe you were always already punched in - so after
   * a punch-out you could never punch in again - and made today() report ACTIVE with
   * zero records for the day.
   */
  private async findOpenAttendance(doctorId: string) {
    return this.attendanceRepo.findOne({
      where: { doctorId, punchOut: IsNull() },
      order: { punchIn: 'DESC' },
    });
  }

  async punchIn(doctorId: string, dto: PunchInDto, actorUserId?: string) {
    const existing = await this.findOpenAttendance(doctorId);
    if (existing) {
      // Idempotent: doctor is already punched in, do not create a duplicate.
      return { attendance: existing, duplicate: true };
    }

    if (dto.shiftId) {
      const shift = await this.shiftRepo.findOne({ where: { id: dto.shiftId, doctorId } });
      if (!shift) throw new BadRequestException('Shift does not belong to this doctor');
    }

    const attendance = this.attendanceRepo.create({
      doctorId,
      shiftId: dto.shiftId,
      punchIn: new Date(),
      deviceId: dto.deviceId,
    });
    const saved = await this.attendanceRepo.save(attendance);
    await this.audit.record(AuditEvent.PUNCH_IN, actorUserId, { doctorId, attendanceId: saved.id });
    return { attendance: saved, duplicate: false };
  }

  async punchOut(doctorId: string, dto: PunchOutDto, actorUserId?: string) {
    const existing = await this.findOpenAttendance(doctorId);
    if (!existing) {
      const last = await this.attendanceRepo.findOne({
        where: { doctorId },
        order: { punchIn: 'DESC' },
      });
      // Idempotent: nothing open to punch out of.
      return { attendance: last ?? null, duplicate: true };
    }

    existing.punchOut = new Date();
    if (dto.deviceId) existing.deviceId = dto.deviceId;
    const saved = await this.attendanceRepo.save(existing);
    await this.audit.record(AuditEvent.PUNCH_OUT, actorUserId, { doctorId, attendanceId: saved.id });
    return { attendance: saved, duplicate: false };
  }

  async today(doctorId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const open = await this.findOpenAttendance(doctorId);
    const records = await this.attendanceRepo
      .createQueryBuilder('a')
      .where('a.doctor_id = :doctorId', { doctorId })
      .andWhere('a.punch_in >= :startOfDay', { startOfDay })
      .orderBy('a.punch_in', 'DESC')
      .getMany();

    return { status: open ? 'ACTIVE' : 'OFFLINE', records };
  }

  /**
   * Section 28: finds a doctor who (1) has an assigned shift, (2) that shift is currently
   * active (now falls within its start/end time-of-day window), (3) has punched in,
   * (4) has not punched out, and (5) is active. Returns null (WAITING_FOR_DOCTOR) if none.
   */
  async getCurrentAvailableDoctor(): Promise<Doctor | null> {
    const nowMinutes = this.currentMinutesOfDay();

    const openAttendance = await this.attendanceRepo
      .createQueryBuilder('a')
      .innerJoin(Doctor, 'n', 'n.id = a.doctor_id')
      .where('a.punch_out IS NULL')
      .andWhere('n.is_active = true')
      .orderBy('a.punch_in', 'ASC')
      .getMany();

    for (const attendance of openAttendance) {
      const shifts = await this.shiftRepo.find({
        where: { doctorId: attendance.doctorId, isActive: true },
      });
      const hasActiveShiftNow = shifts.some((shift) =>
        this.isWithinShiftWindow(nowMinutes, shift.startTime, shift.endTime),
      );
      if (hasActiveShiftNow) {
        return this.doctorRepo.findOne({ where: { id: attendance.doctorId } });
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

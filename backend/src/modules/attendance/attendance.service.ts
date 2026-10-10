import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThanOrEqual, Repository } from 'typeorm';
import { Attendance } from './entities/attendance.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { PunchInDto } from './dto/punch-in.dto';
import { PunchOutDto } from './dto/punch-out.dto';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../../common/enums/audit-event.enum';
import {
  DEFAULT_CLINIC_TIMEZONE,
  clinicMinutesOfDay,
  clinicStartOfDay,
  isWithinShiftWindow,
} from '../../common/util/clinic-time';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Attendance) private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(Doctor) private readonly doctorRepo: Repository<Doctor>,
    @InjectRepository(Shift) private readonly shiftRepo: Repository<Shift>,
    private readonly audit: AuditService,
    private readonly config?: ConfigService,
  ) {}

  private get clinicTimeZone(): string {
    return this.config?.get<string>('clinic.timeZone') || DEFAULT_CLINIC_TIMEZONE;
  }

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

  /**
   * The doctor's attendance row for the current *clinic* day, if one already exists -
   * open or closed. At most one such row can exist: punchIn() only ever reopens this
   * row or creates it when absent, which is also what the DB-level unique index
   * (one row per doctor per clinic day) enforces.
   */
  private async findTodayAttendance(doctorId: string) {
    return this.attendanceRepo.findOne({
      where: { doctorId, punchIn: MoreThanOrEqual(clinicStartOfDay(this.clinicTimeZone)) },
    });
  }

  /**
   * One row per doctor per clinic day, holding the day's first punch-in and latest
   * punch-out - not a new row per punch cycle. "Punch in" therefore means: if already
   * punched in, no-op; else if today already has a (punched-out) row, reopen it
   * (clearing punch_out, keeping its original punch_in); else this is the day's first
   * punch, create the row.
   */
  async punchIn(doctorId: string, dto: PunchInDto, actorUserId?: string) {
    const openExisting = await this.findOpenAttendance(doctorId);
    if (openExisting) {
      // Idempotent: doctor is already punched in, do not create a duplicate. (If this
      // open row is from a previous clinic day because they forgot to punch out, it
      // is still the row representing their continuous on-duty status - see today().)
      return { attendance: openExisting, duplicate: true };
    }

    if (dto.shiftId) {
      const shift = await this.shiftRepo.findOne({ where: { id: dto.shiftId, doctorId } });
      if (!shift) throw new BadRequestException('Shift does not belong to this doctor');
    }

    const todayRow = await this.findTodayAttendance(doctorId);
    if (todayRow) {
      // Reopen: original punch_in is preserved, only punch_out is cleared.
      // Must be an explicit null, not undefined - TypeORM's save() skips an
      // undefined property instead of clearing the column, which would leave
      // punch_out holding its old, stale value.
      todayRow.punchOut = null as unknown as Date;
      if (dto.shiftId) todayRow.shiftId = dto.shiftId;
      if (dto.deviceId) todayRow.deviceId = dto.deviceId;
      const saved = await this.attendanceRepo.save(todayRow);
      await this.audit.record(AuditEvent.PUNCH_IN, actorUserId, { doctorId, attendanceId: saved.id });
      return { attendance: saved, duplicate: false };
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
    // "Today" is the clinic's day, not the server's: with the host in UTC, a 09:00 IST
    // punch-in sits before the UTC midnight boundary only after 05:30 IST, so an early
    // shift's records would have been reported under the wrong day.
    const open = await this.findOpenAttendance(doctorId);
    const todayRow = await this.findTodayAttendance(doctorId);

    // There is at most one row per clinic day, so this is usually just [todayRow].
    // The one case they differ: a doctor forgot to punch out before midnight, so the
    // still-open row's punch_in is yesterday's and findTodayAttendance (today's date)
    // doesn't return it - included explicitly so status=ACTIVE is never paired with
    // an empty records list, which was the original reported contradiction.
    const records: Attendance[] = [];
    if (todayRow) records.push(todayRow);
    if (open && open.id !== todayRow?.id) records.push(open);

    return { status: open ? 'ACTIVE' : 'OFFLINE', records };
  }

  /**
   * Section 28: finds a doctor who (1) has an assigned shift, (2) that shift is currently
   * active (now falls within its start/end time-of-day window), (3) has punched in,
   * (4) has not punched out, and (5) is active. Returns null (WAITING_FOR_DOCTOR) if none.
   */
  async getCurrentAvailableDoctor(): Promise<Doctor | null> {
    const nowMinutes = clinicMinutesOfDay(this.clinicTimeZone);

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
        isWithinShiftWindow(nowMinutes, shift.startTime, shift.endTime),
      );
      if (hasActiveShiftNow) {
        return this.doctorRepo.findOne({ where: { id: attendance.doctorId } });
      }
    }

    return null;
  }

}

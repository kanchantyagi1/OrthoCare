import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Attendance } from '../attendance/entities/attendance.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { Escalation } from '../escalations/entities/escalation.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { EscalationPriority, EscalationStatus } from '../../common/enums/escalation.enum';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function avgMinutes(diffsMs: number[]): number | null {
  if (!diffsMs.length) return null;
  const avgMs = diffsMs.reduce((a, b) => a + b, 0) / diffsMs.length;
  return Math.round((avgMs / 60000) * 10) / 10;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Attendance) private readonly attendanceRepo: Repository<Attendance>,
    @InjectRepository(Doctor) private readonly doctorRepo: Repository<Doctor>,
    @InjectRepository(Escalation) private readonly escalationRepo: Repository<Escalation>,
    @InjectRepository(ChatSession) private readonly sessionRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessage) private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(Shift) private readonly shiftRepo: Repository<Shift>,
    private readonly config: ConfigService,
  ) {}

  /// Doctor-scoped counterpart to overview(), backing the doctor home screen
  /// (spec section 31): today's shift, punch state, and this doctor's own caseload.
  async doctorOverview(doctorId: string) {
    const [shifts, openAttendance, escalations] = await Promise.all([
      this.shiftRepo.find({ where: { doctorId, isActive: true } }),
      this.attendanceRepo.findOne({
        where: { doctorId, punchOut: IsNull() },
        order: { punchIn: 'DESC' },
      }),
      this.escalationRepo.find({ where: { assignedDoctorId: doctorId } }),
    ]);

    const nowHhMm = new Date().toTimeString().slice(0, 5);
    // Shifts are daily HH:mm windows; a window whose end is <= its start wraps midnight.
    const todayShift =
      shifts.find((s) =>
        s.endTime > s.startTime
          ? nowHhMm >= s.startTime && nowHhMm < s.endTime
          : nowHhMm >= s.startTime || nowHhMm < s.endTime,
      ) ?? shifts[0] ?? null;

    const since = startOfToday();
    const responseTimes = escalations
      .filter((e) => e.contactedAt && e.assignedAt)
      .map((e) => e.contactedAt!.getTime() - e.assignedAt!.getTime());

    return {
      todayShift,
      attendance: openAttendance ?? null,
      status: openAttendance ? 'ACTIVE' : 'OFFLINE',
      newCases: escalations.filter((e) => e.status === EscalationStatus.ASSIGNED).length,
      pending: escalations.filter(
        (e) => e.status === EscalationStatus.ASSIGNED || e.status === EscalationStatus.CONTACTED,
      ).length,
      resolved: escalations.filter(
        (e) => e.status === EscalationStatus.RESOLVED && e.resolvedAt && e.resolvedAt >= since,
      ).length,
      averageResponseMinutes: avgMinutes(responseTimes) ?? 0,
    };
  }

  async overview() {
    const since = startOfToday();

    // IsNull() is required here too - a bare null is dropped by TypeORM, which made this
    // count every attendance row ever recorded instead of the currently open ones.
    const activeDoctors = await this.attendanceRepo.count({ where: { punchOut: IsNull() } });
    const patientChatsToday = await this.sessionRepo
      .createQueryBuilder('s')
      .where('s.created_at >= :since', { since })
      .getCount();

    const resolvedByAssistantToday = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.role = :role', { role: 'assistant' })
      .andWhere('m.needs_human = false')
      .andWhere('m.created_at >= :since', { since })
      .getCount();

    const escalationsToday = await this.escalationRepo
      .createQueryBuilder('e')
      .where('e.created_at >= :since', { since })
      .getCount();

    const pending = await this.escalationRepo.count({
      where: [{ status: EscalationStatus.WAITING_FOR_DOCTOR }, { status: EscalationStatus.ASSIGNED }],
    });
    const urgent = await this.escalationRepo.count({
      where: { priority: EscalationPriority.URGENT, status: EscalationStatus.ASSIGNED },
    });

    return {
      activeDoctors,
      // Field names match what the admin dashboard cards read.
      patientChats: patientChatsToday,
      resolvedByAssistant: resolvedByAssistantToday,
      humanEscalations: escalationsToday,
      pending,
      urgent,
      doctorPerformance: await this.doctorPerformance(),
    };
  }

  async doctorPerformance() {
    const doctors = await this.doctorRepo.find({ relations: ['user'] });
    const slaMs =
      this.config.get<number>('sla.doctorFirstResponseMinutes', 15) * 60_000;

    const results: {
      doctorId: string;
      doctorName: string;
      assigned: number;
      resolved: number;
      pending: number;
      averageResponseMinutes: number;
      slaBreaches: number;
    }[] = [];

    for (const doctor of doctors) {
      const escalations = await this.escalationRepo.find({ where: { assignedDoctorId: doctor.id } });
      const resolved = escalations.filter((e) => e.status === EscalationStatus.RESOLVED);
      const pending = escalations.filter(
        (e) => e.status === EscalationStatus.ASSIGNED || e.status === EscalationStatus.CONTACTED,
      );
      const responseTimes = escalations
        .filter((e) => e.contactedAt && e.assignedAt)
        .map((e) => e.contactedAt!.getTime() - e.assignedAt!.getTime());

      // A case still waiting past the SLA counts as breached too, not just slow
      // ones that were eventually answered - otherwise ignoring a case looks clean.
      const now = Date.now();
      const slaBreaches = escalations.filter((e) => {
        if (!e.assignedAt) return false;
        const responded = e.contactedAt?.getTime();
        return (responded ?? now) - e.assignedAt.getTime() > slaMs;
      }).length;

      results.push({
        doctorId: doctor.id,
        doctorName: doctor.user?.fullName || '',
        assigned: escalations.length,
        resolved: resolved.length,
        pending: pending.length,
        averageResponseMinutes: avgMinutes(responseTimes) ?? 0,
        slaBreaches,
      });
    }
    return results;
  }

  async attendanceReport() {
    const since = startOfToday();
    const rows = await this.attendanceRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.doctor', 'doctor')
      .leftJoinAndSelect('doctor.user', 'user')
      .where('a.punch_in >= :since', { since })
      .orderBy('a.punch_in', 'DESC')
      .getMany();

    return rows.map((row) => ({
      doctorName: row.doctor?.user?.fullName || '',
      punchIn: row.punchIn.toISOString(),
      punchOut: row.punchOut ? row.punchOut.toISOString() : null,
    }));
  }

  async escalationsReport() {
    const all = await this.escalationRepo.find({ order: { createdAt: 'DESC' } });
    const firstResponseTimes = all
      .filter((e) => e.contactedAt)
      .map((e) => e.contactedAt!.getTime() - e.createdAt.getTime());
    const resolutionTimes = all
      .filter((e) => e.resolvedAt)
      .map((e) => e.resolvedAt!.getTime() - e.createdAt.getTime());

    return {
      total: all.length,
      byStatus: Object.values(EscalationStatus).reduce((acc, s) => {
        acc[s] = all.filter((e) => e.status === s).length;
        return acc;
      }, {} as Record<string, number>),
      avgFirstResponseMinutes: avgMinutes(firstResponseTimes),
      avgResolutionMinutes: avgMinutes(resolutionTimes),
    };
  }

  async assistantReport() {
    const messages = await this.messageRepo.find({ where: { role: 'assistant' } });
    const supported = messages.filter((m) => m.confidence === 'supported').length;
    const insufficient = messages.filter((m) => m.confidence === 'insufficient_context').length;
    const escalated = messages.filter((m) => m.needsHuman).length;

    return {
      totalResponses: messages.length,
      supported,
      insufficientContext: insufficient,
      escalatedToHuman: escalated,
    };
  }
}

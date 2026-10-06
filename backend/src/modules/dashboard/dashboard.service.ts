import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance } from '../attendance/entities/attendance.entity';
import { Nurse } from '../nurses/entities/nurse.entity';
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
    @InjectRepository(Nurse) private readonly nurseRepo: Repository<Nurse>,
    @InjectRepository(Escalation) private readonly escalationRepo: Repository<Escalation>,
    @InjectRepository(ChatSession) private readonly sessionRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessage) private readonly messageRepo: Repository<ChatMessage>,
  ) {}

  async overview() {
    const since = startOfToday();

    const activeNurses = await this.attendanceRepo.count({ where: { punchOut: null as any } });
    const patientChatsToday = await this.sessionRepo
      .createQueryBuilder('s')
      .where('s.created_at >= :since', { since })
      .getCount();

    const aiResolvedToday = await this.messageRepo
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
      where: [{ status: EscalationStatus.WAITING_FOR_NURSE }, { status: EscalationStatus.ASSIGNED }],
    });
    const urgent = await this.escalationRepo.count({
      where: { priority: EscalationPriority.URGENT, status: EscalationStatus.ASSIGNED },
    });

    return {
      activeNurses,
      patientChatsToday,
      aiResolvedToday,
      humanEscalationsToday: escalationsToday,
      pending,
      urgent,
      nursePerformance: await this.nursePerformance(),
    };
  }

  async nursePerformance() {
    const nurses = await this.nurseRepo.find({ relations: ['user'] });
    const results: {
      nurseId: string;
      name: string | undefined;
      assigned: number;
      resolved: number;
      pending: number;
      avgResponseMinutes: number | null;
    }[] = [];

    for (const nurse of nurses) {
      const escalations = await this.escalationRepo.find({ where: { assignedNurseId: nurse.id } });
      const resolved = escalations.filter((e) => e.status === EscalationStatus.RESOLVED);
      const pending = escalations.filter(
        (e) => e.status === EscalationStatus.ASSIGNED || e.status === EscalationStatus.CONTACTED,
      );
      const responseTimes = escalations
        .filter((e) => e.contactedAt && e.assignedAt)
        .map((e) => e.contactedAt!.getTime() - e.assignedAt!.getTime());

      results.push({
        nurseId: nurse.id,
        name: nurse.user?.fullName,
        assigned: escalations.length,
        resolved: resolved.length,
        pending: pending.length,
        avgResponseMinutes: avgMinutes(responseTimes),
      });
    }
    return results;
  }

  async attendanceReport() {
    const since = startOfToday();
    return this.attendanceRepo
      .createQueryBuilder('a')
      .where('a.punch_in >= :since', { since })
      .orderBy('a.punch_in', 'DESC')
      .getMany();
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

  async aiReport() {
    const messages = await this.messageRepo.find({ where: { role: 'assistant' } });
    const supported = messages.filter((m) => m.confidence === 'supported').length;
    const insufficient = messages.filter((m) => m.confidence === 'insufficient_context').length;
    const escalated = messages.filter((m) => m.needsHuman).length;

    return {
      totalAiResponses: messages.length,
      supported,
      insufficientContext: insufficient,
      escalatedToHuman: escalated,
    };
  }
}

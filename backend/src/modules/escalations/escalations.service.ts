import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Escalation } from './entities/escalation.entity';
import { NurseCaseNote } from './entities/nurse-case-note.entity';
import { EscalationPriority, EscalationStatus } from '../../common/enums/escalation.enum';
import { AttendanceService } from '../attendance/attendance.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { NursesService } from '../nurses/nurses.service';
import { PatientsService } from '../patients/patients.service';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../../common/enums/audit-event.enum';
import { ResolveEscalationDto } from './dto/resolve-escalation.dto';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class EscalationsService {
  private readonly logger = new Logger(EscalationsService.name);

  constructor(
    @InjectRepository(Escalation) private readonly repo: Repository<Escalation>,
    @InjectRepository(NurseCaseNote) private readonly notesRepo: Repository<NurseCaseNote>,
    private readonly attendance: AttendanceService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
    private readonly nurses: NursesService,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
  ) {}

  async create(params: {
    patientId: string;
    chatSessionId?: string;
    chatMessageId?: string;
    question: string;
    aiResponse?: string;
    reason: string;
    priority?: EscalationPriority;
  }) {
    const escalation = await this.repo.save(
      this.repo.create({
        patientId: params.patientId,
        chatSessionId: params.chatSessionId,
        chatMessageId: params.chatMessageId,
        question: params.question,
        aiResponse: params.aiResponse,
        reason: params.reason,
        priority: params.priority || EscalationPriority.NORMAL,
        status: EscalationStatus.WAITING_FOR_NURSE,
      }),
    );

    await this.audit.record(AuditEvent.ESCALATION_CREATED, undefined, {
      escalationId: escalation.id,
      priority: escalation.priority,
    });

    await this.assignToAvailableNurse(escalation.id);
    return this.findOne(escalation.id);
  }

  /** Section 28: assigns to the current active nurse, or leaves WAITING_FOR_NURSE + notifies admins. */
  async assignToAvailableNurse(escalationId: string) {
    const escalation = await this.findOne(escalationId);
    const nurse = await this.attendance.getCurrentAvailableNurse();

    if (!nurse) {
      const admins = await this.users.findByRole(Role.ADMIN);
      await this.notifications.notifyAdminsNoNurseAvailable(admins, escalationId);
      this.logger.warn(`No nurse available - escalation ${escalationId} left WAITING_FOR_NURSE`);
      return escalation;
    }

    escalation.assignedNurseId = nurse.id;
    escalation.status = EscalationStatus.ASSIGNED;
    escalation.assignedAt = new Date();
    await this.repo.save(escalation);

    const nurseUser = await this.users.findById(nurse.userId);
    const patient = await this.patients.findOne(escalation.patientId);
    if (!nurseUser) {
      this.logger.error(`Nurse ${nurse.id} has no linked user account - cannot notify`);
      return this.findOne(escalationId);
    }

    await this.notifications.notifyEscalationAssigned({
      nurseUser,
      patientName: patient?.user?.fullName || 'a patient',
      priority: escalation.priority,
      escalationId: escalation.id,
    });

    await this.audit.record(AuditEvent.ESCALATION_ASSIGNED, undefined, {
      escalationId,
      nurseId: nurse.id,
    });

    return this.findOne(escalationId);
  }

  async findAll(filter?: { status?: EscalationStatus; nurseId?: string }) {
    const where: any = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.nurseId) where.assignedNurseId = filter.nurseId;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const escalation = await this.repo.findOne({ where: { id } });
    if (!escalation) throw new NotFoundException('Escalation not found');
    return escalation;
  }

  async markContacted(escalationId: string, nurseId: string) {
    const escalation = await this.findOne(escalationId);
    escalation.status = EscalationStatus.CONTACTED;
    escalation.contactedAt = escalation.contactedAt || new Date();
    await this.repo.save(escalation);
    await this.audit.record(AuditEvent.NURSE_CONTACTED, undefined, { escalationId, nurseId });
    return escalation;
  }

  async resolve(escalationId: string, nurseId: string, dto: ResolveEscalationDto) {
    const escalation = await this.findOne(escalationId);

    const note = this.notesRepo.create({
      escalationId,
      nurseId,
      patientContacted: dto.patientContacted,
      contactTime: dto.patientContacted ? new Date() : undefined,
      issueCategory: dto.issueCategory,
      resolution: dto.resolution,
      followUpRequired: dto.followUpRequired || false,
      escalateToDoctor: dto.escalateToDoctor || false,
      notes: dto.notes,
    });
    await this.notesRepo.save(note);

    escalation.status = dto.escalateToDoctor
      ? EscalationStatus.ESCALATED_TO_DOCTOR
      : EscalationStatus.RESOLVED;
    escalation.resolvedAt = new Date();
    await this.repo.save(escalation);

    await this.audit.record(
      dto.escalateToDoctor ? AuditEvent.DOCTOR_ESCALATION : AuditEvent.CASE_RESOLVED,
      undefined,
      { escalationId, nurseId },
    );

    return { escalation, note };
  }

  async escalateToDoctor(escalationId: string, nurseId: string) {
    const escalation = await this.findOne(escalationId);
    escalation.status = EscalationStatus.ESCALATED_TO_DOCTOR;
    await this.repo.save(escalation);
    await this.audit.record(AuditEvent.DOCTOR_ESCALATION, undefined, { escalationId, nurseId });
    return escalation;
  }

  get repository() {
    return this.repo;
  }
}

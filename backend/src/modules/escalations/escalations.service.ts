import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Escalation } from './entities/escalation.entity';
import { DoctorCaseNote } from './entities/doctor-case-note.entity';
import { EscalationPriority, EscalationStatus } from '../../common/enums/escalation.enum';
import { AttendanceService } from '../attendance/attendance.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { DoctorsService } from '../doctors/doctors.service';
import { PatientsService } from '../patients/patients.service';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../../common/enums/audit-event.enum';
import { ResolveEscalationDto } from './dto/resolve-escalation.dto';
import { Role } from '../../common/enums/role.enum';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { KnowledgeChunk } from '../knowledge/entities/knowledge-chunk.entity';
import { EscalationSource, EscalationView, toEscalationView } from './escalations.mapper';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class EscalationsService {
  private readonly logger = new Logger(EscalationsService.name);

  constructor(
    @InjectRepository(Escalation) private readonly repo: Repository<Escalation>,
    @InjectRepository(DoctorCaseNote) private readonly notesRepo: Repository<DoctorCaseNote>,
    private readonly attendance: AttendanceService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
    private readonly doctors: DoctorsService,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
    // Injected directly rather than via ChatModule/KnowledgeModule: ChatModule already
    // imports this module, so importing it back would be a circular dependency.
    @InjectRepository(ChatMessage) private readonly messageRepo?: Repository<ChatMessage>,
    @InjectRepository(KnowledgeChunk) private readonly chunkRepo?: Repository<KnowledgeChunk>,
    @InjectRepository(ChatSession) private readonly sessionRepo?: Repository<ChatSession>,
  ) {}

  /**
   * Turns an account-less patient's session id into their patient id. The session id
   * is the only credential such a patient has, so this is the single place that
   * translation happens and callers must never accept a patient id from the request.
   */
  async resolvePatientIdFromSession(sessionId: string): Promise<string> {
    const session = await this.sessionRepo?.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Chat session not found');
    return session.patientId;
  }

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
        status: EscalationStatus.WAITING_FOR_DOCTOR,
      }),
    );

    await this.audit.record(AuditEvent.ESCALATION_CREATED, undefined, {
      escalationId: escalation.id,
      priority: escalation.priority,
    });

    await this.assignToAvailableDoctor(escalation.id);
    return this.findOne(escalation.id);
  }

  /** Section 28: assigns to the current active doctor, or leaves WAITING_FOR_DOCTOR + notifies admins. */
  async assignToAvailableDoctor(escalationId: string) {
    const escalation = await this.findOne(escalationId);
    const doctor = await this.attendance.getCurrentAvailableDoctor();

    if (!doctor) {
      const admins = await this.users.findByRole(Role.ADMIN);
      await this.notifications.notifyAdminsNoDoctorAvailable(admins, escalationId);
      this.logger.warn(`No doctor available - escalation ${escalationId} left WAITING_FOR_DOCTOR`);
      return escalation;
    }

    escalation.assignedDoctorId = doctor.id;
    escalation.status = EscalationStatus.ASSIGNED;
    escalation.assignedAt = new Date();
    await this.repo.save(escalation);

    const doctorUser = await this.users.findById(doctor.userId);
    const patient = await this.patients.findOne(escalation.patientId);
    if (!doctorUser) {
      this.logger.error(`Doctor ${doctor.id} has no linked user account - cannot notify`);
      return this.findOne(escalationId);
    }

    await this.notifications.notifyEscalationAssigned({
      doctorUser,
      patientName: patient?.fullName || patient?.user?.fullName || 'a patient',
      priority: escalation.priority,
      escalationId: escalation.id,
    });

    await this.audit.record(AuditEvent.ESCALATION_ASSIGNED, undefined, {
      escalationId,
      doctorId: doctor.id,
    });

    return this.findOne(escalationId);
  }

  /**
   * `includeUnassignedQueue` is what a doctor's case list needs. Filtering purely on
   * `assignedDoctorId` meant an escalation created while nobody was punched in
   * (WAITING_FOR_DOCTOR, no assignee) was visible to NO doctor at all, while the
   * patient's own screen still showed it pending - so those cases silently rotted.
   * Doctors now also see the unassigned queue and can claim from it; the two groups
   * stay distinguishable by `status`/`assignedDoctorId` on the existing view shape.
   */
  async findAll(filter?: {
    status?: EscalationStatus;
    doctorId?: string;
    patientId?: string;
    includeUnassignedQueue?: boolean;
  }) {
    const base: any = {};
    if (filter?.status) base.status = filter.status;
    if (filter?.patientId) base.patientId = filter.patientId;

    if (!filter?.doctorId) {
      return this.repo.find({ where: base, order: { createdAt: 'DESC' } });
    }

    const mine = { ...base, assignedDoctorId: filter.doctorId };
    if (!filter.includeUnassignedQueue) {
      return this.repo.find({ where: mine, order: { createdAt: 'DESC' } });
    }

    // An array of where-objects is an OR in TypeORM.
    const waiting: any = {
      ...base,
      assignedDoctorId: IsNull(),
      status: EscalationStatus.WAITING_FOR_DOCTOR,
    };
    // An explicit ?status= filter must not be widened by the queue clause.
    if (filter.status && filter.status !== EscalationStatus.WAITING_FOR_DOCTOR) {
      return this.repo.find({ where: mine, order: { createdAt: 'DESC' } });
    }

    return this.repo.find({ where: [mine, waiting], order: { createdAt: 'DESC' } });
  }

  /**
   * Claims an unassigned case. The guard clauses live in the UPDATE's WHERE rather
   * than in a read-then-write, so two doctors tapping Claim at the same instant
   * cannot both win - the second one's UPDATE matches zero rows.
   */
  private async tryClaim(escalationId: string, doctorId: string): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .update(Escalation)
      .set({
        assignedDoctorId: doctorId,
        status: EscalationStatus.ASSIGNED,
        assignedAt: new Date(),
      })
      .where('id = :id', { id: escalationId })
      .andWhere('assigned_doctor_id IS NULL')
      .andWhere('status = :waiting', { waiting: EscalationStatus.WAITING_FOR_DOCTOR })
      .execute();

    if (!result.affected) return false;

    await this.audit.record(AuditEvent.ESCALATION_ASSIGNED, undefined, {
      escalationId,
      doctorId,
      claimed: true,
    });
    return true;
  }

  async claim(escalationId: string, doctorId: string) {
    if (await this.tryClaim(escalationId, doctorId)) {
      return this.findOneView(escalationId);
    }

    // Either it does not exist, or somebody else already holds it.
    const existing = await this.repo.findOne({ where: { id: escalationId } });
    if (!existing) throw new NotFoundException('Escalation not found');
    throw new ConflictException('This case has already been claimed');
  }

  /**
   * Assigns every case still waiting for a doctor to the one who just punched in.
   * Without this, a question asked outside shift hours stays unassigned forever,
   * because assignment is only ever attempted at creation time.
   */
  async assignWaitingCasesTo(doctorId: string): Promise<number> {
    const waiting = await this.repo.find({
      where: { assignedDoctorId: IsNull(), status: EscalationStatus.WAITING_FOR_DOCTOR },
      order: { createdAt: 'ASC' },
      select: ['id'],
    });
    if (!waiting.length) return 0;

    // tryClaim rather than claim(): no view building, and a case another doctor
    // grabbed in the same instant is skipped instead of failing the punch-in.
    let assigned = 0;
    for (const { id } of waiting) {
      if (await this.tryClaim(id, doctorId)) assigned++;
    }

    if (assigned) {
      this.logger.log(`Assigned ${assigned} waiting case(s) to doctor ${doctorId} on punch-in`);
    }
    return assigned;
  }

  async findOne(id: string) {
    const escalation = await this.repo.findOne({ where: { id } });
    if (!escalation) throw new NotFoundException('Escalation not found');
    return escalation;
  }

  /** HTTP-shaped list (includes the patient's callable phone number and AI sources). */
  async findAllViews(filter?: {
    status?: EscalationStatus;
    doctorId?: string;
    patientId?: string;
    includeUnassignedQueue?: boolean;
  }): Promise<EscalationView[]> {
    const escalations = await this.findAll(filter);
    return Promise.all(escalations.map((e) => this.toView(e)));
  }

  async findOneView(id: string): Promise<EscalationView> {
    return this.toView(await this.findOne(id));
  }

  private async toView(escalation: Escalation): Promise<EscalationView> {
    const patient = await this.patients.findOne(escalation.patientId);

    let doctorName: string | null = null;
    if (escalation.assignedDoctorId) {
      const doctor = await this.doctors.findOne(escalation.assignedDoctorId);
      doctorName = doctor?.user?.fullName ?? null;
    }

    return toEscalationView(escalation, patient, doctorName, await this.sourcesFor(escalation));
  }

  /**
   * Resolves which approved clinic chunks the AI actually used, so the doctor can see
   * what the patient was told and where it came from (spec section 24/32).
   */
  private async sourcesFor(escalation: Escalation): Promise<EscalationSource[]> {
    if (!escalation.chatMessageId || !this.messageRepo || !this.chunkRepo) return [];

    const message = await this.messageRepo.findOne({ where: { id: escalation.chatMessageId } });
    // Stored citations are model output, so they can be malformed - rows written in
    // mock mode hold positional indices like "1". Passing one of those to a uuid
    // column throws QueryFailedError and took down the whole case list (a 500 on
    // GET /escalations for every doctor), so filter to well-formed uuids first.
    const chunkIds = (message?.sourceChunkIds ?? []).filter((id) => UUID_PATTERN.test(id));
    if (!chunkIds.length) return [];

    const chunks = await this.chunkRepo.find({ where: { id: In(chunkIds) } });
    const scores = message?.similarityScores ?? [];

    // Preserve the order the AI cited them in; scores are recorded positionally.
    return chunkIds
      .map((chunkId, index) => {
        const chunk = chunks.find((c) => c.id === chunkId);
        if (!chunk) return null;
        return {
          documentId: chunk.documentId,
          fileName: chunk.fileName,
          pageNumber: chunk.pageNumber ?? null,
          sectionTitle: chunk.sectionTitle ?? null,
          similarityScore: typeof scores[index] === 'number' ? scores[index] : null,
        };
      })
      .filter((s): s is EscalationSource => s !== null);
  }

  async markContacted(escalationId: string, doctorId: string) {
    const escalation = await this.findOne(escalationId);
    escalation.status = EscalationStatus.CONTACTED;
    escalation.contactedAt = escalation.contactedAt || new Date();
    await this.repo.save(escalation);
    await this.audit.record(AuditEvent.DOCTOR_CONTACTED, undefined, { escalationId, doctorId });
    return escalation;
  }

  async resolve(escalationId: string, doctorId: string, dto: ResolveEscalationDto) {
    const escalation = await this.findOne(escalationId);

    const note = this.notesRepo.create({
      escalationId,
      doctorId,
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
      { escalationId, doctorId },
    );

    return { escalation, note };
  }

  async escalateToDoctor(escalationId: string, doctorId: string) {
    const escalation = await this.findOne(escalationId);
    escalation.status = EscalationStatus.ESCALATED_TO_DOCTOR;
    await this.repo.save(escalation);
    await this.audit.record(AuditEvent.DOCTOR_ESCALATION, undefined, { escalationId, doctorId });
    return escalation;
  }

  get repository() {
    return this.repo;
  }
}

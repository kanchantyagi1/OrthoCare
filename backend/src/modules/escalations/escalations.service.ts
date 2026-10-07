import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
    @InjectRepository(NurseCaseNote) private readonly notesRepo: Repository<NurseCaseNote>,
    private readonly attendance: AttendanceService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
    private readonly nurses: NursesService,
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
      patientName: patient?.fullName || patient?.user?.fullName || 'a patient',
      priority: escalation.priority,
      escalationId: escalation.id,
    });

    await this.audit.record(AuditEvent.ESCALATION_ASSIGNED, undefined, {
      escalationId,
      nurseId: nurse.id,
    });

    return this.findOne(escalationId);
  }

  async findAll(filter?: { status?: EscalationStatus; nurseId?: string; patientId?: string }) {
    const where: any = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.nurseId) where.assignedNurseId = filter.nurseId;
    if (filter?.patientId) where.patientId = filter.patientId;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const escalation = await this.repo.findOne({ where: { id } });
    if (!escalation) throw new NotFoundException('Escalation not found');
    return escalation;
  }

  /** HTTP-shaped list (includes the patient's callable phone number and AI sources). */
  async findAllViews(filter?: {
    status?: EscalationStatus;
    nurseId?: string;
    patientId?: string;
  }): Promise<EscalationView[]> {
    const escalations = await this.findAll(filter);
    return Promise.all(escalations.map((e) => this.toView(e)));
  }

  async findOneView(id: string): Promise<EscalationView> {
    return this.toView(await this.findOne(id));
  }

  private async toView(escalation: Escalation): Promise<EscalationView> {
    const patient = await this.patients.findOne(escalation.patientId);

    let nurseName: string | null = null;
    if (escalation.assignedNurseId) {
      const nurse = await this.nurses.findOne(escalation.assignedNurseId);
      nurseName = nurse?.user?.fullName ?? null;
    }

    return toEscalationView(escalation, patient, nurseName, await this.sourcesFor(escalation));
  }

  /**
   * Resolves which approved clinic chunks the AI actually used, so the nurse can see
   * what the patient was told and where it came from (spec section 24/32).
   */
  private async sourcesFor(escalation: Escalation): Promise<EscalationSource[]> {
    if (!escalation.chatMessageId || !this.messageRepo || !this.chunkRepo) return [];

    const message = await this.messageRepo.findOne({ where: { id: escalation.chatMessageId } });
    // Stored citations are model output, so they can be malformed - rows written in
    // mock mode hold positional indices like "1". Passing one of those to a uuid
    // column throws QueryFailedError and took down the whole case list (a 500 on
    // GET /escalations for every nurse), so filter to well-formed uuids first.
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

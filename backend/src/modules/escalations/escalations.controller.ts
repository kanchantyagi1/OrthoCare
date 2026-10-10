import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StaffOrPatientSessionGuard } from '../../common/guards/staff-or-patient-session.guard';
import { PatientThrottlerGuard } from '../../common/guards/patient-throttler.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EscalationsService } from './escalations.service';
import { DoctorsService } from '../doctors/doctors.service';
import { CreateEscalationDto } from './dto/create-escalation.dto';
import { ResolveEscalationDto } from './dto/resolve-escalation.dto';
import { EscalationStatus } from '../../common/enums/escalation.enum';

/**
 * Guards are declared per-route rather than on the class, because patients have no
 * account: the "request a doctor" and "my requests" routes are public and are
 * authorised by possession of a chat session id, while every staff route still
 * requires a JWT plus a role.
 */
@Controller('escalations')
export class EscalationsController {
  constructor(
    private readonly escalations: EscalationsService,
    private readonly doctors: DoctorsService,
  ) {}

  /**
   * PUBLIC - patient asks to be called by a doctor. The patient is derived from the
   * session id; nothing patient-identifying in the body is trusted.
   */
  @UseGuards(PatientThrottlerGuard)
  @Throttle({ default: { limit: 6, ttl: 3600000 } })
  @Post()
  async create(@Body() dto: CreateEscalationDto) {
    const patientId = await this.escalations.resolvePatientIdFromSession(dto.sessionId);
    return this.escalations.create({
      patientId,
      chatSessionId: dto.sessionId,
      chatMessageId: dto.chatMessageId,
      question: dto.question,
      aiResponse: dto.aiResponse,
      reason: dto.reason || 'Patient requested human assistance',
    });
  }

  /**
   * Serves two audiences (see StaffOrPatientSessionGuard):
   *  - `?sessionId=` (public): only the escalations of that session's patient.
   *  - staff JWT: a doctor sees her assigned cases, admin/doctor see all.
   */
  @UseGuards(StaffOrPatientSessionGuard)
  @Get()
  async findAll(
    @CurrentUser() user: { id: string; role: Role } | undefined,
    @Query('sessionId') sessionId?: string,
    @Query('status') status?: EscalationStatus,
  ) {
    if (sessionId) {
      const patientId = await this.escalations.resolvePatientIdFromSession(sessionId);
      return this.escalations.findAllViews({ patientId });
    }

    if (user?.role === Role.DOCTOR) {
      const doctor = await this.doctors.findByUserIdOrThrow(user.id);
      // Plus the unassigned WAITING_FOR_DOCTOR queue: cases raised while nobody was
      // punched in belong to no doctor, and filtering on assignment alone hid them
      // from everyone while the patient still saw them as pending.
      return this.escalations.findAllViews({
        status,
        doctorId: doctor.id,
        includeUnassignedQueue: true,
      });
    }
    return this.escalations.findAllViews({ status });
  }

  // Staff only: detail view is not exposed to patients at all, so a patient can
  // never read a case by id - they only ever get their own list above.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.DOCTOR)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.escalations.findOneView(id);
  }

  /** Takes an unassigned case off the waiting queue. Conflicts if already claimed. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR)
  @Post(':id/claim')
  async claim(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    const doctor = await this.doctors.findByUserIdOrThrow(user.id);
    return this.escalations.claim(id, doctor.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR)
  @Post(':id/contact')
  async contact(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    const doctor = await this.doctors.findByUserIdOrThrow(user.id);
    return this.escalations.markContacted(id, doctor.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR)
  @Post(':id/resolve')
  async resolve(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ResolveEscalationDto,
  ) {
    const doctor = await this.doctors.findByUserIdOrThrow(user.id);
    return this.escalations.resolve(id, doctor.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DOCTOR)
  @Post(':id/escalate-doctor')
  async escalateToDoctor(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    const doctor = await this.doctors.findByUserIdOrThrow(user.id);
    return this.escalations.escalateToDoctor(id, doctor.id);
  }
}

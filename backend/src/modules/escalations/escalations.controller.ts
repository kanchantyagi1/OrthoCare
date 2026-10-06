import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EscalationsService } from './escalations.service';
import { NursesService } from '../nurses/nurses.service';
import { PatientsService } from '../patients/patients.service';
import { CreateEscalationDto } from './dto/create-escalation.dto';
import { ResolveEscalationDto } from './dto/resolve-escalation.dto';
import { EscalationStatus } from '../../common/enums/escalation.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('escalations')
export class EscalationsController {
  constructor(
    private readonly escalations: EscalationsService,
    private readonly nurses: NursesService,
    private readonly patients: PatientsService,
  ) {}

  @Roles(Role.PATIENT)
  @Post()
  async create(@CurrentUser() user: { id: string }, @Body() dto: CreateEscalationDto) {
    const patient = await this.patients.findByUserIdOrThrow(user.id);
    return this.escalations.create({
      patientId: patient.id,
      chatSessionId: dto.chatSessionId,
      chatMessageId: dto.chatMessageId,
      question: dto.question,
      aiResponse: dto.aiResponse,
      reason: dto.reason || 'Patient requested human assistance',
    });
  }

  @Roles(Role.NURSE, Role.ADMIN, Role.DOCTOR)
  @Get()
  async findAll(
    @CurrentUser() user: { id: string; role: Role },
    @Query('status') status?: EscalationStatus,
  ) {
    if (user.role === Role.NURSE) {
      const nurse = await this.nurses.findByUserIdOrThrow(user.id);
      return this.escalations.findAll({ status, nurseId: nurse.id });
    }
    return this.escalations.findAll({ status });
  }

  @Roles(Role.NURSE, Role.ADMIN, Role.DOCTOR)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.escalations.findOne(id);
  }

  @Roles(Role.NURSE)
  @Post(':id/contact')
  async contact(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    const nurse = await this.nurses.findByUserIdOrThrow(user.id);
    return this.escalations.markContacted(id, nurse.id);
  }

  @Roles(Role.NURSE)
  @Post(':id/resolve')
  async resolve(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ResolveEscalationDto,
  ) {
    const nurse = await this.nurses.findByUserIdOrThrow(user.id);
    return this.escalations.resolve(id, nurse.id, dto);
  }

  @Roles(Role.NURSE)
  @Post(':id/escalate-doctor')
  async escalateToDoctor(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    const nurse = await this.nurses.findByUserIdOrThrow(user.id);
    return this.escalations.escalateToDoctor(id, nurse.id);
  }
}

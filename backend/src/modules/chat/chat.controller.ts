import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { PatientsService } from '../patients/patients.service';
import { SendMessageDto } from './dto/send-message.dto';
import { FeedbackDto } from './dto/feedback.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PATIENT)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly patients: PatientsService,
  ) {}

  @Post('session')
  async createSession(@CurrentUser() user: { id: string }) {
    const patient = await this.patients.findByUserIdOrThrow(user.id);
    return this.chat.createSession(patient.id);
  }

  @Post('message')
  async sendMessage(@CurrentUser() user: { id: string }, @Body() dto: SendMessageDto) {
    const patient = await this.patients.findByUserIdOrThrow(user.id);
    return this.chat.sendMessage(patient.id, dto.sessionId, dto.message);
  }

  @Post('message/:id/feedback')
  async feedback(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: FeedbackDto,
  ) {
    const patient = await this.patients.findByUserIdOrThrow(user.id);
    return this.chat.submitFeedback(patient.id, id, dto.helpful);
  }

  @Get('history')
  async history(@CurrentUser() user: { id: string }) {
    const patient = await this.patients.findByUserIdOrThrow(user.id);
    return this.chat.history(patient.id);
  }
}

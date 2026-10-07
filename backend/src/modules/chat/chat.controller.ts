import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { PatientThrottlerGuard } from '../../common/guards/patient-throttler.guard';
import { ChatService } from './chat.service';
import { PatientsService } from '../patients/patients.service';
import { StartSessionDto } from './dto/start-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { FeedbackDto } from './dto/feedback.dto';
import { SessionScopedDto } from './dto/session-scoped.dto';

/**
 * PUBLIC, UNAUTHENTICATED endpoints - patients have no account and never log in.
 *
 * A patient gives a phone number once; the returned `sessionId` (a server-generated
 * v4 UUID) is thereafter their only credential, and the nurse uses the phone number
 * to call them back when something is escalated.
 *
 * Because there is no login, every handler re-derives the patient from the session
 * id server-side and never trusts a patient id from the request. Both this
 * controller's rate limits and the per-phone daily cap exist because a paid model
 * sits behind these routes.
 */
@UseGuards(PatientThrottlerGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly patients: PatientsService,
    private readonly config: ConfigService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('session')
  async createSession(@Body() dto: StartSessionDto) {
    const patient = await this.patients.findOrCreateByPhone(dto.phone, dto.name);
    const session = await this.chat.createSession(patient.id);
    return { sessionId: session.id, patientId: patient.id };
  }

  @Throttle({ default: { limit: 12, ttl: 60000 } })
  @Post('message')
  async sendMessage(@Body() dto: SendMessageDto) {
    const session = await this.chat.getSessionOrThrowById(dto.sessionId);
    await this.chat.assertDailyQuotaRemaining(session.patientId);
    return this.chat.sendMessage(session.patientId, session.id, dto.message);
  }

  @Post('message/:id/feedback')
  async feedback(@Param('id') id: string, @Body() dto: FeedbackDto) {
    // The session id proves the caller owns the conversation this message belongs to.
    const session = await this.chat.getSessionOrThrowById(dto.sessionId);
    return this.chat.submitFeedbackForSession(session.patientId, session.id, id, dto.helpful);
  }

  /** Past conversations for the patient behind this session id. */
  @Get('history')
  async history(@Query() query: SessionScopedDto) {
    const session = await this.chat.getSessionOrThrowById(query.sessionId);
    return this.chat.history(session.patientId);
  }

  /** Replays one conversation when the app reopens it. */
  @Get('messages')
  messages(@Query() query: SessionScopedDto) {
    return this.chat.messagesForSession(query.sessionId);
  }
}

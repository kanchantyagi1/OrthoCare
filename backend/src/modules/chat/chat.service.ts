import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { RedFlagRulesService } from '../red-flag-rules/red-flag-rules.service';
import { EscalationsService } from '../escalations/escalations.service';
import { PatientsService } from '../patients/patients.service';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../../common/enums/audit-event.enum';
import { AiConfidence, EscalationPriority } from '../../common/enums/escalation.enum';
import { SAFE_ESCALATION_MESSAGE } from '../ai/system-prompt';
import { toChatSessionListItem } from './chat.mapper';

const PRIORITY_RANK: Record<EscalationPriority, number> = {
  [EscalationPriority.NORMAL]: 0,
  [EscalationPriority.HIGH]: 1,
  [EscalationPriority.URGENT]: 2,
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatSession) private readonly sessionRepo: Repository<ChatSession>,
    @InjectRepository(ChatMessage) private readonly messageRepo: Repository<ChatMessage>,
    private readonly knowledge: KnowledgeService,
    private readonly ai: AiProviderService,
    private readonly redFlags: RedFlagRulesService,
    private readonly escalations: EscalationsService,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async createSession(patientId: string) {
    return this.sessionRepo.save(this.sessionRepo.create({ patientId, status: 'OPEN' }));
  }

  /**
   * Resolves a session id to its session. This is the only credential an
   * account-less patient has, so every public endpoint goes through here and then
   * works strictly from the returned session's patientId - never from anything the
   * caller supplied.
   */
  async getSessionOrThrowById(sessionId: string) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Chat session not found');
    return session;
  }

  /** Messages of one session, oldest first - what the chat screen replays on open. */
  async messagesForSession(sessionId: string) {
    await this.getSessionOrThrowById(sessionId);
    return this.messageRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } });
  }

  async history(patientId: string) {
    const sessions = await this.sessionRepo.find({
      where: { patientId },
      order: { createdAt: 'DESC' },
    });

    return Promise.all(
      sessions.map(async (session) => {
        const lastMessage = await this.messageRepo.findOne({
          where: { sessionId: session.id },
          order: { createdAt: 'DESC' },
        });
        return toChatSessionListItem(session, lastMessage);
      }),
    );
  }

  /**
   * Rejects a patient who has already burned the day's message allowance. Lives
   * outside sendMessage() so it is an explicit controller-level admission check on
   * the public endpoint, rather than something buried in the answer pipeline.
   */
  async assertDailyQuotaRemaining(patientId: string) {
    const cap = this.config.get<number>('patientLimits.dailyMessageCap', 40);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const used = await this.messageRepo
      .createQueryBuilder('m')
      .innerJoin(ChatSession, 's', 's.id = m.session_id')
      .where('s.patient_id = :patientId', { patientId })
      .andWhere('m.role = :role', { role: 'patient' })
      .andWhere('m.created_at >= :startOfDay', { startOfDay })
      .getCount();

    if (used >= cap) {
      throw new HttpException(
        'You have reached the daily limit for questions. Please contact the clinic directly if you need help today.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async getSessionOrThrow(sessionId: string, patientId: string) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, patientId } });
    if (!session) throw new NotFoundException('Chat session not found');
    return session;
  }

  async sendMessage(patientId: string, sessionId: string, messageText: string) {
    const session = await this.getSessionOrThrow(sessionId, patientId);

    // Idempotency guard (section 58): same patient re-submitting the identical text within
    // a few seconds returns the already-computed answer instead of double-processing.
    const recentDuplicate = await this.messageRepo.findOne({
      where: { sessionId, role: 'patient', message: messageText },
      order: { createdAt: 'DESC' },
    });
    if (recentDuplicate && Date.now() - recentDuplicate.createdAt.getTime() < 5000) {
      const existingAnswer = await this.messageRepo.findOne({
        where: { sessionId, role: 'assistant' },
        order: { createdAt: 'DESC' },
      });
      if (existingAnswer) return { patientMessage: recentDuplicate, assistantMessage: existingAnswer, duplicate: true };
    }

    const patient = await this.patients.findOne(patientId);

    const patientMessage = await this.messageRepo.save(
      this.messageRepo.create({ sessionId, role: 'patient', message: messageText }),
    );

    const history = await this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const queryEmbedding = await this.ai.embed(messageText);
    const retrievedChunks = await this.knowledge.retrieveRelevantChunks({
      queryEmbedding,
      topK: this.config.get<number>('rag.topK', 5),
      similarityThreshold: this.config.get<number>('rag.similarityThreshold', 0.72),
      surgeryType: patient?.surgeryType,
    });

    const redFlagPriority = await this.redFlags.matchPriority(messageText);

    const aiAnswer = await this.ai.answerQuestion({
      question: messageText,
      retrievedChunks,
      conversationHistory: history
        .reverse()
        .map((m) => ({ role: m.role, message: m.message })),
    });

    let finalPriority = aiAnswer.priority;
    let needsHuman = aiAnswer.needsHuman;
    let reason = aiAnswer.reason;

    if (redFlagPriority && PRIORITY_RANK[redFlagPriority] > PRIORITY_RANK[finalPriority]) {
      finalPriority = redFlagPriority;
      needsHuman = true;
      reason = `${reason} | red_flag_rule_matched`.trim();
    }

    const assistantMessage = await this.messageRepo.save(
      this.messageRepo.create({
        sessionId,
        role: 'assistant',
        message: aiAnswer.confidence === AiConfidence.SUPPORTED ? aiAnswer.answer : SAFE_ESCALATION_MESSAGE,
        confidence: aiAnswer.confidence,
        needsHuman,
        priority: finalPriority,
        reason,
        sourceChunkIds: aiAnswer.sourceChunkIds,
        similarityScores: retrievedChunks.map((c) => c.similarity),
        model: this.config.get<boolean>('openai.mockMode') ? 'mock' : this.config.get<string>('openai.model'),
      }),
    );

    session.lastMessageAt = new Date();
    await this.sessionRepo.save(session);

    await this.audit.record(AuditEvent.AI_RESPONSE, undefined, {
      sessionId,
      messageId: assistantMessage.id,
      confidence: assistantMessage.confidence,
      needsHuman,
      priority: finalPriority,
    });

    if (needsHuman) {
      await this.escalations.create({
        patientId,
        chatSessionId: sessionId,
        chatMessageId: assistantMessage.id,
        question: messageText,
        aiResponse: assistantMessage.message,
        reason: reason || 'AI determined human assistance is needed',
        priority: finalPriority,
      });
    }

    return { patientMessage, assistantMessage, duplicate: false };
  }

  /**
   * Public-endpoint wrapper: refuses to rate a message that does not belong to the
   * caller's own conversation, so a leaked/guessed message id cannot be used to
   * poke at someone else's chat.
   */
  async submitFeedbackForSession(
    patientId: string,
    sessionId: string,
    messageId: string,
    helpful: boolean,
  ) {
    const message = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!message || message.sessionId !== sessionId) {
      throw new NotFoundException('Message not found');
    }
    return this.submitFeedback(patientId, messageId, helpful);
  }

  /** "Was this helpful?" - a "No" always creates/confirms a human escalation, even if the AI was confident. */
  async submitFeedback(patientId: string, messageId: string, helpful: boolean) {
    const message = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');

    message.helpful = helpful;
    await this.messageRepo.save(message);

    if (!helpful && !message.needsHuman) {
      const session = await this.sessionRepo.findOne({ where: { id: message.sessionId } });
      const patientMsg = await this.messageRepo.findOne({
        where: { sessionId: message.sessionId, role: 'patient' },
        order: { createdAt: 'DESC' },
      });
      await this.escalations.create({
        patientId,
        chatSessionId: session?.id,
        chatMessageId: message.id,
        question: patientMsg?.message || '(unknown question)',
        aiResponse: message.message,
        reason: 'Patient marked the AI answer as not helpful',
        priority: message.priority || EscalationPriority.NORMAL,
      });
    }

    return message;
  }
}

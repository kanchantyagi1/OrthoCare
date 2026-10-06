import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatSession } from './entities/chat-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AiModule } from '../ai/ai.module';
import { RedFlagRulesModule } from '../red-flag-rules/red-flag-rules.module';
import { EscalationsModule } from '../escalations/escalations.module';
import { PatientsModule } from '../patients/patients.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatSession, ChatMessage]),
    KnowledgeModule,
    AiModule,
    RedFlagRulesModule,
    EscalationsModule,
    PatientsModule,
    AuditModule,
  ],
  providers: [ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}

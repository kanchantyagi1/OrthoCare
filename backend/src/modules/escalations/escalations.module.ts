import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Escalation } from './entities/escalation.entity';
import { NurseCaseNote } from './entities/nurse-case-note.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { KnowledgeChunk } from '../knowledge/entities/knowledge-chunk.entity';
import { EscalationsService } from './escalations.service';
import { EscalationsController } from './escalations.controller';
import { AttendanceModule } from '../attendance/attendance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { NursesModule } from '../nurses/nurses.module';
import { PatientsModule } from '../patients/patients.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    // Chat/knowledge entities are registered here rather than importing ChatModule or
    // KnowledgeModule, which would be circular (ChatModule already imports this one).
    TypeOrmModule.forFeature([Escalation, NurseCaseNote, ChatMessage, ChatSession, KnowledgeChunk]),
    AttendanceModule,
    NotificationsModule,
    UsersModule,
    NursesModule,
    PatientsModule,
    AuditModule,
  ],
  providers: [EscalationsService],
  controllers: [EscalationsController],
  exports: [EscalationsService],
})
export class EscalationsModule {}

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Escalation } from './entities/escalation.entity';
import { DoctorCaseNote } from './entities/doctor-case-note.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { KnowledgeChunk } from '../knowledge/entities/knowledge-chunk.entity';
import { EscalationsService } from './escalations.service';
import { EscalationsController } from './escalations.controller';
import { AttendanceModule } from '../attendance/attendance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { PatientsModule } from '../patients/patients.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    // Chat/knowledge entities are registered here rather than importing ChatModule or
    // KnowledgeModule, which would be circular (ChatModule already imports this one).
    TypeOrmModule.forFeature([Escalation, DoctorCaseNote, ChatMessage, ChatSession, KnowledgeChunk]),
    forwardRef(() => AttendanceModule),
    NotificationsModule,
    UsersModule,
    DoctorsModule,
    PatientsModule,
    AuditModule,
  ],
  providers: [EscalationsService],
  controllers: [EscalationsController],
  exports: [EscalationsService],
})
export class EscalationsModule {}

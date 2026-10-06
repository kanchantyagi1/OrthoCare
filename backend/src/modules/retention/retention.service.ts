import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThan } from 'typeorm';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { Escalation } from '../escalations/entities/escalation.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { Attendance } from '../attendance/entities/attendance.entity';
import { EscalationStatus } from '../../common/enums/escalation.enum';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../../common/enums/audit-event.enum';

/**
 * Purges only PATIENT OPERATIONAL DATA older than DATA_RETENTION_DAYS (section 47-48).
 * Never touches documents / document_versions / knowledge_chunks - those follow a
 * separate, much longer retention policy (DOCUMENT_RETENTION_DAYS is informational for
 * ops/backups only; this job never deletes clinic knowledge).
 * Never deletes an open/active case: only CLOSED chat sessions, RESOLVED escalations,
 * and attendance rows that already have a punch-out are eligible.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  @Cron('0 3 * * *')
  async handleDailyCleanup() {
    await this.cleanup();
  }

  async cleanup() {
    const retentionDays = this.config.get<number>('retention.dataRetentionDays', 30);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const sessionRepo = this.dataSource.getRepository(ChatSession);
    const messageRepo = this.dataSource.getRepository(ChatMessage);
    const escalationRepo = this.dataSource.getRepository(Escalation);
    const notificationRepo = this.dataSource.getRepository(Notification);
    const attendanceRepo = this.dataSource.getRepository(Attendance);

    const expiredSessions = await sessionRepo.find({
      where: { status: 'CLOSED', lastMessageAt: LessThan(cutoff) },
    });
    let deletedMessages = 0;
    if (expiredSessions.length) {
      const sessionIds = expiredSessions.map((s) => s.id);
      const delResult = await messageRepo
        .createQueryBuilder()
        .delete()
        .where('session_id IN (:...sessionIds)', { sessionIds })
        .execute();
      deletedMessages = delResult.affected || 0;
      await sessionRepo.remove(expiredSessions);
    }

    const deletedEscalations = await escalationRepo
      .createQueryBuilder()
      .delete()
      .where('status = :status', { status: EscalationStatus.RESOLVED })
      .andWhere('created_at < :cutoff', { cutoff })
      .execute();

    const deletedNotifications = await notificationRepo
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoff', { cutoff })
      .execute();

    const deletedAttendance = await attendanceRepo
      .createQueryBuilder()
      .delete()
      .where('punch_out IS NOT NULL')
      .andWhere('punch_out < :cutoff', { cutoff })
      .execute();

    const summary = {
      cutoff,
      deletedChatSessions: expiredSessions.length,
      deletedChatMessages: deletedMessages,
      deletedEscalations: deletedEscalations.affected || 0,
      deletedNotifications: deletedNotifications.affected || 0,
      deletedAttendance: deletedAttendance.affected || 0,
    };

    this.logger.log(`Retention cleanup complete: ${JSON.stringify(summary)}`);
    await this.audit.record(AuditEvent.RETENTION_CLEANUP, undefined, summary);
    return summary;
  }
}

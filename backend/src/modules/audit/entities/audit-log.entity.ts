import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AuditEvent } from '../../../common/enums/audit-event.enum';

@Entity('audit_logs')
export class AuditLog extends BaseEntity {
  @Column({ type: 'enum', enum: AuditEvent })
  event: AuditEvent;

  @Column({ name: 'actor_user_id', nullable: true })
  actorUserId?: string;

  // Deliberately metadata only - never store raw patient medical message text here.
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;
}

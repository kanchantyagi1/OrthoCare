import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Escalation } from '../../escalations/entities/escalation.entity';

@Entity('notifications')
export class Notification extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  data?: Record<string, any>;

  @Column({ default: 'PENDING' })
  status: 'PENDING' | 'SENT' | 'FAILED' | 'MOCKED';

  @ManyToOne(() => Escalation, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'related_escalation_id' })
  relatedEscalation?: Escalation;

  @Column({ name: 'related_escalation_id', nullable: true })
  relatedEscalationId?: string;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string;
}

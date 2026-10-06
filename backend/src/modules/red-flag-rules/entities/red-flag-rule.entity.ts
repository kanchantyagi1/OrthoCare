import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { EscalationPriority } from '../../../common/enums/escalation.enum';

@Entity('red_flag_rules')
export class RedFlagRule extends BaseEntity {
  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  keywords: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  symptoms: string[];

  @Column({ type: 'enum', enum: EscalationPriority, default: EscalationPriority.URGENT })
  priority: EscalationPriority;

  @Column({ name: 'doctor_id', nullable: true })
  doctorId?: string;

  @Column({ default: 'ACTIVE' })
  status: 'ACTIVE' | 'INACTIVE';
}

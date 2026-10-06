import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Escalation } from './escalation.entity';
import { Nurse } from '../../nurses/entities/nurse.entity';

@Entity('nurse_case_notes')
export class NurseCaseNote extends BaseEntity {
  @ManyToOne(() => Escalation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escalation_id' })
  escalation: Escalation;

  @Column({ name: 'escalation_id' })
  escalationId: string;

  @ManyToOne(() => Nurse, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'nurse_id' })
  nurse?: Nurse;

  @Column({ name: 'nurse_id', nullable: true })
  nurseId?: string;

  @Column({ name: 'patient_contacted', default: false })
  patientContacted: boolean;

  @Column({ name: 'contact_time', type: 'timestamptz', nullable: true })
  contactTime?: Date;

  @Column({ name: 'issue_category', nullable: true })
  issueCategory?: string;

  @Column({ type: 'text', nullable: true })
  resolution?: string;

  @Column({ name: 'follow_up_required', default: false })
  followUpRequired: boolean;

  @Column({ name: 'escalate_to_doctor', default: false })
  escalateToDoctor: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}

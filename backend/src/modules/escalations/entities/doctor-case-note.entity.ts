import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Escalation } from './escalation.entity';
import { Doctor } from '../../doctors/entities/doctor.entity';

@Entity('doctor_case_notes')
export class DoctorCaseNote extends BaseEntity {
  @ManyToOne(() => Escalation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escalation_id' })
  escalation: Escalation;

  @Column({ name: 'escalation_id' })
  escalationId: string;

  @ManyToOne(() => Doctor, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'doctor_id' })
  doctor?: Doctor;

  @Column({ name: 'doctor_id', nullable: true })
  doctorId?: string;

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

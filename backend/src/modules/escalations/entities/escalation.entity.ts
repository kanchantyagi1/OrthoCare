import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { EscalationPriority, EscalationStatus } from '../../../common/enums/escalation.enum';
import { Patient } from '../../patients/entities/patient.entity';
import { ChatSession } from '../../chat/entities/chat-session.entity';
import { ChatMessage } from '../../chat/entities/chat-message.entity';
import { Doctor } from '../../doctors/entities/doctor.entity';

@Entity('escalations')
export class Escalation extends BaseEntity {
  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({ name: 'patient_id' })
  patientId: string;

  @ManyToOne(() => ChatSession, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'chat_session_id' })
  chatSession?: ChatSession;

  @Column({ name: 'chat_session_id', nullable: true })
  chatSessionId?: string;

  @ManyToOne(() => ChatMessage, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'chat_message_id' })
  chatMessage?: ChatMessage;

  @Column({ name: 'chat_message_id', nullable: true })
  chatMessageId?: string;

  @Column({ type: 'text' })
  question: string;

  @Column({ name: 'ai_response', type: 'text', nullable: true })
  aiResponse?: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'enum', enum: EscalationPriority, default: EscalationPriority.NORMAL })
  priority: EscalationPriority;

  @ManyToOne(() => Doctor, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_doctor_id' })
  assignedDoctor?: Doctor;

  @Column({ name: 'assigned_doctor_id', nullable: true })
  assignedDoctorId?: string;

  @Column({
    type: 'enum',
    enum: EscalationStatus,
    default: EscalationStatus.WAITING_FOR_DOCTOR,
  })
  status: EscalationStatus;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt?: Date;

  @Column({ name: 'contacted_at', type: 'timestamptz', nullable: true })
  contactedAt?: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date;
}

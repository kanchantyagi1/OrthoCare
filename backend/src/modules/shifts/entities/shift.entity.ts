import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Doctor } from '../../doctors/entities/doctor.entity';

@Entity('shifts')
export class Shift extends BaseEntity {
  @ManyToOne(() => Doctor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;

  @Column({ name: 'doctor_id' })
  doctorId: string;

  @Column({ nullable: true })
  label?: string;

  // Time-of-day window, e.g. "09:00" - "12:00". Stored as text to avoid timezone footguns on a single-clinic MVP.
  @Column({ name: 'start_time' })
  startTime: string;

  @Column({ name: 'end_time' })
  endTime: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}

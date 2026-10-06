import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Doctor } from '../../doctors/entities/doctor.entity';

@Entity('patients')
export class Patient extends BaseEntity {
  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'surgery_type', nullable: true })
  surgeryType?: string;

  @Column({ name: 'surgery_date', type: 'date', nullable: true })
  surgeryDate?: string;

  @ManyToOne(() => Doctor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'doctor_id' })
  doctor?: Doctor;

  @Column({ name: 'doctor_id', nullable: true })
  doctorId?: string;

  @Column({ name: 'preferred_language', default: 'en' })
  preferredLanguage: string;
}

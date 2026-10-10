import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Doctor } from '../../doctors/entities/doctor.entity';

/**
 * A patient has NO login. They identify themselves with a phone number only, which
 * is also how the doctor calls them back after an escalation, so `phone`/`fullName`
 * live on this row rather than on a user account.
 *
 * `user`/`userId` remain for the account-based patients that predate this change;
 * they are nullable and are not created for new patients.
 */
@Entity('patients')
export class Patient extends BaseEntity {
  @OneToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'user_id', nullable: true })
  userId?: string;

  @Index()
  @Column({ nullable: true })
  phone?: string;

  @Column({ name: 'full_name', nullable: true })
  fullName?: string;

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

  /** Display name for staff screens, preferring the patient's own details. */
  get displayName(): string {
    return this.fullName || this.user?.fullName || 'Patient';
  }

  /** The number a doctor should call. */
  get contactPhone(): string | undefined {
    return this.phone || this.user?.phone;
  }
}

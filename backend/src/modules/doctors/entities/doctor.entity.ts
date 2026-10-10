import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity('doctors')
export class Doctor extends BaseEntity {
  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'employee_code', nullable: true })
  employeeCode?: string;

  // Carried over from the former separate doctor profile when the two staff roles
  // were merged, so clinical credentials are not lost.
  @Column({ nullable: true })
  specialization?: string;

  @Column({ name: 'license_number', nullable: true })
  licenseNumber?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}

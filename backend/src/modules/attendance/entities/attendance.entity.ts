import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Doctor } from '../../doctors/entities/doctor.entity';
import { Shift } from '../../shifts/entities/shift.entity';

@Entity('attendance')
export class Attendance extends BaseEntity {
  @ManyToOne(() => Doctor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;

  @Column({ name: 'doctor_id' })
  doctorId: string;

  @ManyToOne(() => Shift, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'shift_id' })
  shift?: Shift;

  @Column({ name: 'shift_id', nullable: true })
  shiftId?: string;

  @Column({ name: 'punch_in', type: 'timestamptz' })
  punchIn: Date;

  @Column({ name: 'punch_out', type: 'timestamptz', nullable: true })
  punchOut?: Date;

  @Column({ name: 'device_id', nullable: true })
  deviceId?: string;
}

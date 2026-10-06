import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { DocumentStatus } from '../../../common/enums/document-status.enum';
import { User } from '../../users/entities/user.entity';

/**
 * Logical document (e.g. "Knee Replacement Guideline"). The actual files/content
 * live in DocumentVersion rows; this row tracks which version is currently active.
 */
@Entity('documents')
export class ClinicDocument extends BaseEntity {
  @Column()
  title: string;

  @Column({ name: 'surgery_type', nullable: true })
  surgeryType?: string;

  @Column({ nullable: true })
  category?: string;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.UPLOADED,
  })
  status: DocumentStatus;

  @Column({ name: 'current_version_id', nullable: true })
  currentVersionId?: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedBy: User;

  @Column({ name: 'uploaded_by_user_id' })
  uploadedByUserId: string;
}

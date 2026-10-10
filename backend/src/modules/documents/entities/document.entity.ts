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

  // Nullable so a clinic document survives the removal of the staff account that
  // uploaded it; the API renders a missing uploader as "Unknown".
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedBy?: User;

  @Column({ name: 'uploaded_by_user_id', nullable: true })
  uploadedByUserId?: string;
}

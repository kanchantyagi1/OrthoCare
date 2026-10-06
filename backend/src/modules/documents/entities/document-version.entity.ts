import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { DocumentStatus } from '../../../common/enums/document-status.enum';
import { ClinicDocument } from './document.entity';

@Entity('document_versions')
export class DocumentVersion extends BaseEntity {
  @ManyToOne(() => ClinicDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: ClinicDocument;

  @Index()
  @Column({ name: 'document_id' })
  documentId: string;

  @Column({ name: 'version_label' })
  versionLabel: string; // e.g. "v1", "v2"

  @Column({ name: 'file_name' })
  fileName: string;

  @Column({ name: 'mime_type' })
  mimeType: string;

  // S3 key when AWS is configured, otherwise a relative path under backend/storage/documents.
  @Column({ name: 'storage_key' })
  storageKey: string;

  @Column({ name: 'storage_backend', default: 'local' })
  storageBackend: 'local';

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.UPLOADED,
  })
  status: DocumentStatus;

  @Column({ name: 'failure_reason', nullable: true, type: 'text' })
  failureReason?: string;

  @Column({ name: 'chunk_count', default: 0 })
  chunkCount: number;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt?: Date;
}

import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { DocumentStatus } from '../../../common/enums/document-status.enum';
import { ClinicDocument } from '../../documents/entities/document.entity';
import { DocumentVersion } from '../../documents/entities/document-version.entity';

/**
 * NOTE on the `embedding` column:
 * Physical column is `vector(1536)` (pgvector), created directly in the migration SQL.
 * TypeORM has no first-class pgvector column type, so this entity intentionally does NOT
 * declare `embedding` as a mapped column. All reads/writes of the embedding vector go
 * through raw parameterized SQL in KnowledgeService (`... $1::vector ...`), which avoids
 * ORM type-coercion pitfalls entirely. See docs/RAG.md for the rationale.
 */
@Entity('knowledge_chunks')
export class KnowledgeChunk extends BaseEntity {
  @ManyToOne(() => ClinicDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: ClinicDocument;

  @Index()
  @Column({ name: 'document_id' })
  documentId: string;

  @ManyToOne(() => DocumentVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_version_id' })
  documentVersionEntity: DocumentVersion;

  @Column({ name: 'document_version_id' })
  documentVersionId: string;

  @Column({ name: 'document_version' })
  documentVersion: string; // denormalized version label, e.g. "v2"

  @Column({ name: 'file_name' })
  fileName: string;

  @Column({ name: 'page_number', nullable: true })
  pageNumber?: number;

  @Column({ name: 'section_title', nullable: true })
  sectionTitle?: string;

  @Column({ name: 'chunk_index' })
  chunkIndex: number;

  @Column({ name: 'chunk_text', type: 'text' })
  chunkText: string;

  @Index()
  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.UPLOADED,
  })
  status: DocumentStatus;

  @Column({ name: 'surgery_type', nullable: true })
  surgeryType?: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ name: 'recovery_phase', nullable: true })
  recoveryPhase?: string;

  @Column({ default: 'en' })
  language: string;
}

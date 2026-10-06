import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClinicDocument } from './entities/document.entity';
import { DocumentVersion } from './entities/document-version.entity';
import { DocumentStatus } from '../../common/enums/document-status.enum';
import { StorageService } from '../storage/storage.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../../common/enums/audit-event.enum';
import { extractPdf } from './extraction/pdf-extractor';
import { extractDocx } from './extraction/docx-extractor';
import { chunkDocxBlocks, chunkPdfPages } from './chunking/chunker';
import { UploadDocumentDto } from './dto/upload-document.dto';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(ClinicDocument) private readonly documentRepo: Repository<ClinicDocument>,
    @InjectRepository(DocumentVersion) private readonly versionRepo: Repository<DocumentVersion>,
    private readonly storage: StorageService,
    private readonly knowledge: KnowledgeService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.documentRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const doc = await this.documentRepo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async versionsFor(documentId: string) {
    return this.versionRepo.find({ where: { documentId }, order: { createdAt: 'DESC' } });
  }

  async upload(
    file: { originalname: string; mimetype: string; buffer: Buffer },
    dto: UploadDocumentDto,
    uploadedByUserId: string,
  ) {
    if (![PDF_MIME, DOCX_MIME].includes(file.mimetype)) {
      throw new BadRequestException('Only PDF and DOCX files are supported');
    }

    let document = await this.documentRepo.findOne({ where: { title: dto.title } });
    let versionLabel = 'v1';
    if (!document) {
      document = await this.documentRepo.save(
        this.documentRepo.create({
          title: dto.title,
          surgeryType: dto.surgeryType,
          category: dto.category,
          status: DocumentStatus.UPLOADED,
          uploadedByUserId,
        }),
      );
    } else {
      const existingVersions = await this.versionRepo.count({ where: { documentId: document.id } });
      versionLabel = `v${existingVersions + 1}`;
    }

    const storageKey = `${document.id}/${versionLabel}-${file.originalname}`;
    const stored = await this.storage.save(storageKey, file.buffer, file.mimetype);

    const version = await this.versionRepo.save(
      this.versionRepo.create({
        documentId: document.id,
        versionLabel,
        fileName: file.originalname,
        mimeType: file.mimetype,
        storageKey: stored.storageKey,
        storageBackend: stored.storageBackend,
        status: DocumentStatus.UPLOADED,
      }),
    );

    await this.audit.record(AuditEvent.DOCUMENT_UPLOADED, uploadedByUserId, {
      documentId: document.id,
      versionId: version.id,
      versionLabel,
    });

    // Document does not become searchable until processing succeeds (section 11).
    await this.process(version.id);

    return this.versionRepo.findOne({ where: { id: version.id } });
  }

  async process(versionId: string) {
    const version = await this.versionRepo.findOne({ where: { id: versionId } });
    if (!version) throw new NotFoundException('Document version not found');

    version.status = DocumentStatus.PROCESSING;
    await this.versionRepo.save(version);
    await this.documentRepo.update({ id: version.documentId }, { status: DocumentStatus.PROCESSING });

    try {
      const buffer = await this.storage.read(version.storageKey);
      const document = await this.findOne(version.documentId);

      let chunkCount = 0;

      if (version.mimeType === PDF_MIME) {
        const extracted = await extractPdf(buffer);
        if (extracted.ocrRequired) {
          await this.markOcrRequired(version, document.id);
          return version;
        }
        const chunkInputs = chunkPdfPages(extracted.pages);
        chunkCount = await this.knowledge.insertChunks({
          documentId: document.id,
          documentVersionId: version.id,
          documentVersion: version.versionLabel,
          fileName: version.fileName,
          surgeryType: document.surgeryType,
          category: document.category,
          status: DocumentStatus.READY_FOR_REVIEW,
          chunks: chunkInputs,
        });
      } else {
        const extracted = await extractDocx(buffer);
        if (extracted.ocrRequired) {
          await this.markOcrRequired(version, document.id);
          return version;
        }
        const chunkInputs = chunkDocxBlocks(extracted.blocks);
        chunkCount = await this.knowledge.insertChunks({
          documentId: document.id,
          documentVersionId: version.id,
          documentVersion: version.versionLabel,
          fileName: version.fileName,
          surgeryType: document.surgeryType,
          category: document.category,
          status: DocumentStatus.READY_FOR_REVIEW,
          chunks: chunkInputs,
        });
      }

      version.status = DocumentStatus.READY_FOR_REVIEW;
      version.chunkCount = chunkCount;
      version.processedAt = new Date();
      version.failureReason = null as unknown as string;
      await this.versionRepo.save(version);
      await this.documentRepo.update({ id: document.id }, { status: DocumentStatus.READY_FOR_REVIEW });

      await this.audit.record(AuditEvent.EMBEDDING_CREATED, undefined, {
        documentId: document.id,
        versionId: version.id,
        chunkCount,
      });
    } catch (err) {
      this.logger.error(`Processing failed for version ${versionId}: ${(err as Error).message}`);
      version.status = DocumentStatus.FAILED;
      version.failureReason = (err as Error).message;
      await this.versionRepo.save(version);
      await this.documentRepo.update({ id: version.documentId }, { status: DocumentStatus.FAILED });
    }

    return version;
  }

  private async markOcrRequired(version: DocumentVersion, documentId: string) {
    version.status = DocumentStatus.OCR_REQUIRED;
    version.failureReason = 'Unable to extract sufficient text - this looks like a scanned/image-only document. OCR is not yet implemented (planned next phase).';
    await this.versionRepo.save(version);
    await this.documentRepo.update({ id: documentId }, { status: DocumentStatus.OCR_REQUIRED });
  }

  async reprocess(versionId: string) {
    await this.knowledge.setStatusForVersion(versionId, DocumentStatus.ARCHIVED);
    return this.process(versionId);
  }

  /**
   * Section 41 demo-data workflow: DEMO_REVIEW_REQUIRED -> (doctor reviews) -> this call
   * moves it to READY_FOR_REVIEW, exactly like a freshly-processed real upload, so the
   * normal activate() path is the only way anything ever reaches ACTIVE. Demo seed content
   * is never auto-activated.
   */
  async approveDemoRecord(documentId: string, actorUserId?: string) {
    const document = await this.findOne(documentId);
    if (document.status !== DocumentStatus.DEMO_REVIEW_REQUIRED) {
      throw new BadRequestException(`Document is not awaiting demo review (currently ${document.status})`);
    }
    const versions = await this.versionsFor(documentId);
    const version = versions.find((v) => v.status === DocumentStatus.DEMO_REVIEW_REQUIRED);
    if (!version) throw new NotFoundException('No DEMO_REVIEW_REQUIRED version found');

    version.status = DocumentStatus.READY_FOR_REVIEW;
    await this.versionRepo.save(version);
    await this.knowledge.setStatusForVersion(version.id, DocumentStatus.READY_FOR_REVIEW);
    await this.documentRepo.update({ id: documentId }, { status: DocumentStatus.READY_FOR_REVIEW });

    await this.audit.record(AuditEvent.DOCUMENT_ACTIVATED, actorUserId, {
      documentId,
      versionId: version.id,
      note: 'demo_record_approved_for_review',
    });
    return this.findOne(documentId);
  }

  /**
   * Activates the given version as the document's live, chatbot-retrievable content.
   * Archives whatever version/chunks were previously ACTIVE (section 15 versioning) -
   * their chat_message source references remain intact for audit, only their status flips.
   */
  async activate(documentId: string, versionId: string | undefined, actorUserId?: string) {
    const document = await this.findOne(documentId);

    let version: DocumentVersion | null = null;
    if (versionId) {
      version = await this.versionRepo.findOne({ where: { id: versionId, documentId } });
    } else {
      version = await this.versionRepo.findOne({
        where: { documentId, status: DocumentStatus.READY_FOR_REVIEW },
        order: { createdAt: 'DESC' },
      });
    }
    if (!version) throw new NotFoundException('No READY_FOR_REVIEW document version found to activate');
    if (version.status !== DocumentStatus.READY_FOR_REVIEW) {
      throw new BadRequestException(`Version must be READY_FOR_REVIEW to activate (currently ${version.status})`);
    }

    if (document.currentVersionId && document.currentVersionId !== version.id) {
      await this.versionRepo.update({ id: document.currentVersionId }, { status: DocumentStatus.ARCHIVED });
      await this.knowledge.setStatusForVersion(document.currentVersionId, DocumentStatus.ARCHIVED);
    }

    version.status = DocumentStatus.ACTIVE;
    await this.versionRepo.save(version);
    await this.knowledge.setStatusForVersion(version.id, DocumentStatus.ACTIVE);
    await this.documentRepo.update(
      { id: documentId },
      { status: DocumentStatus.ACTIVE, currentVersionId: version.id },
    );

    await this.audit.record(AuditEvent.DOCUMENT_ACTIVATED, actorUserId, { documentId, versionId: version.id });
    return this.findOne(documentId);
  }

  async archive(documentId: string, actorUserId?: string) {
    const document = await this.findOne(documentId);
    if (document.currentVersionId) {
      await this.versionRepo.update({ id: document.currentVersionId }, { status: DocumentStatus.ARCHIVED });
      await this.knowledge.setStatusForVersion(document.currentVersionId, DocumentStatus.ARCHIVED);
    }
    await this.documentRepo.update(
      { id: documentId },
      { status: DocumentStatus.ARCHIVED, currentVersionId: null as unknown as string },
    );
    await this.audit.record(AuditEvent.DOCUMENT_ARCHIVED, actorUserId, { documentId });
    return this.findOne(documentId);
  }

  /** Soft-delete: archives the document rather than hard-deleting, to preserve audit trails for existing chat references. */
  async remove(documentId: string, actorUserId?: string) {
    await this.archive(documentId, actorUserId);
    return { success: true, note: 'Document archived, not hard-deleted, to preserve chat audit references.' };
  }
}

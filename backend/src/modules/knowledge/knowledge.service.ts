import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { KnowledgeChunk } from './entities/knowledge-chunk.entity';
import { DocumentStatus } from '../../common/enums/document-status.enum';
import { ChunkInput } from '../documents/chunking/chunker';
import { AiProviderService } from '../ai/ai-provider.service';
import { RetrievedChunk } from '../ai/interfaces/ai-response.interface';

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(KnowledgeChunk) private readonly chunkRepo: Repository<KnowledgeChunk>,
    private readonly ai: AiProviderService,
  ) {}

  /**
   * Embeds and inserts chunks for a document version. Embedding + the vector column write
   * go through raw parameterized SQL (`$n::vector`) - see docs/RAG.md for why this bypasses
   * the TypeORM repository API for just this one column.
   */
  async insertChunks(params: {
    documentId: string;
    documentVersionId: string;
    documentVersion: string;
    fileName: string;
    surgeryType?: string;
    category?: string;
    status: DocumentStatus;
    chunks: ChunkInput[];
  }): Promise<number> {
    let index = 0;
    for (const chunk of params.chunks) {
      const embedding = await this.ai.embed(chunk.chunkText);
      const id = uuid();

      await this.dataSource.query(
        `INSERT INTO knowledge_chunks
          (id, document_id, document_version_id, document_version, file_name, page_number,
           section_title, chunk_index, chunk_text, embedding, status, surgery_type, category, language)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector,$11,$12,$13,'en')`,
        [
          id,
          params.documentId,
          params.documentVersionId,
          params.documentVersion,
          params.fileName,
          chunk.pageNumber ?? null,
          chunk.sectionTitle ?? null,
          index,
          chunk.chunkText,
          toVectorLiteral(embedding),
          params.status,
          params.surgeryType ?? null,
          params.category ?? null,
        ],
      );
      index++;
    }
    return index;
  }

  async setStatusForVersion(documentVersionId: string, status: DocumentStatus) {
    await this.chunkRepo.update({ documentVersionId }, { status });
  }

  async setStatusForDocument(documentId: string, status: DocumentStatus) {
    await this.chunkRepo.update({ documentId }, { status });
  }

  async countForVersion(documentVersionId: string) {
    return this.chunkRepo.count({ where: { documentVersionId } });
  }

  async listForDocument(documentId: string) {
    return this.chunkRepo.find({ where: { documentId }, order: { chunkIndex: 'ASC' } });
  }

  /**
   * Core RAG retrieval: embeds the query, runs pgvector cosine-distance search restricted
   * to status=ACTIVE chunks (never ARCHIVED/FAILED/DRAFT/DEMO_REVIEW_REQUIRED - section 21),
   * optionally filtered by surgery type, and applies the configured similarity threshold
   * (section 22) - chunks below threshold are dropped rather than forced into context.
   */
  async retrieveRelevantChunks(params: {
    queryEmbedding: number[];
    topK: number;
    similarityThreshold: number;
    surgeryType?: string;
  }): Promise<RetrievedChunk[]> {
    const vectorLiteral = toVectorLiteral(params.queryEmbedding);

    const surgeryFilter = params.surgeryType
      ? `AND (surgery_type IS NULL OR surgery_type = $3)`
      : '';
    const args: any[] = [vectorLiteral, params.topK];
    if (params.surgeryType) args.push(params.surgeryType);

    const rows = await this.dataSource.query(
      `SELECT id, chunk_text, file_name, section_title, page_number,
              1 - (embedding <=> $1::vector) AS similarity
       FROM knowledge_chunks
       WHERE status = 'ACTIVE' ${surgeryFilter}
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      args,
    );

    return rows
      .map((r: any) => ({
        id: r.id,
        chunkText: r.chunk_text,
        fileName: r.file_name,
        sectionTitle: r.section_title,
        pageNumber: r.page_number,
        similarity: parseFloat(r.similarity),
      }))
      .filter((r: RetrievedChunk) => r.similarity >= params.similarityThreshold);
  }
}

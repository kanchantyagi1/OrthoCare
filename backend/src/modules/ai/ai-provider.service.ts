import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { mockEmbed } from './mock-embedding.util';
import { PATIENT_SUPPORT_SYSTEM_PROMPT, SAFE_ESCALATION_MESSAGE, AI_UNAVAILABLE_MESSAGE } from './system-prompt';
import { AiConfidence, EscalationPriority } from '../../common/enums/escalation.enum';
import { RetrievedChunk, StructuredAiAnswer } from './interfaces/ai-response.interface';

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private readonly client: OpenAI | null;
  private readonly mockMode: boolean;
  private readonly embeddingModel: string;
  private readonly chatModel: string;

  constructor(private readonly config: ConfigService) {
    this.mockMode = this.config.get<boolean>('openai.mockMode', true);
    this.embeddingModel = this.config.get<string>('openai.embeddingModel', 'text-embedding-3-small');
    this.chatModel = this.config.get<string>('openai.model', 'gpt-4.1-mini');
    this.client = this.mockMode
      ? null
      : new OpenAI({ apiKey: this.config.get<string>('openai.apiKey') });
  }

  async embed(text: string): Promise<number[]> {
    if (this.mockMode) {
      return mockEmbed(text);
    }
    try {
      const res = await this.client!.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });
      return res.data[0].embedding;
    } catch (err) {
      this.logger.error(`Embedding call failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async answerQuestion(params: {
    question: string;
    retrievedChunks: RetrievedChunk[];
    conversationHistory: { role: 'patient' | 'assistant'; message: string }[];
  }): Promise<StructuredAiAnswer> {
    const { question, retrievedChunks } = params;

    if (this.mockMode) {
      return this.mockAnswer(question, retrievedChunks);
    }

    const context = retrievedChunks
      .map(
        (c, i) =>
          `[${i + 1}] (source: ${c.fileName}${c.sectionTitle ? ' - ' + c.sectionTitle : ''}${c.pageNumber ? ', page ' + c.pageNumber : ''})\n${c.chunkText}`,
      )
      .join('\n\n');

    const recentHistory = params.conversationHistory.slice(-6);

    try {
      const completion = await this.client!.chat.completions.create({
        model: this.chatModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PATIENT_SUPPORT_SYSTEM_PROMPT },
          ...recentHistory.map((h) => ({
            role: (h.role === 'patient' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: h.message,
          })),
          {
            role: 'user',
            content: `Approved clinic knowledge context:\n${context || '(no relevant context found)'}\n\nPatient question: ${question}`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(raw);

      return {
        answer: parsed.answer || SAFE_ESCALATION_MESSAGE,
        confidence:
          parsed.confidence === AiConfidence.SUPPORTED
            ? AiConfidence.SUPPORTED
            : AiConfidence.INSUFFICIENT_CONTEXT,
        needsHuman: Boolean(parsed.needs_human),
        priority: Object.values(EscalationPriority).includes(parsed.priority)
          ? parsed.priority
          : EscalationPriority.NORMAL,
        reason: parsed.reason || '',
        // The model generates these ids, so they are untrusted: it has been seen
        // returning positional indices ("1", "2") instead of ids, and nothing stops
        // it inventing one. Keep only ids belonging to chunks we actually supplied,
        // so a citation can never point at a document this answer never saw and a
        // non-UUID value can never reach a uuid column.
        sourceChunkIds: this.validCitedChunkIds(parsed.source_chunk_ids, retrievedChunks),
      };
    } catch (err) {
      this.logger.error(`Chat completion failed: ${(err as Error).message}`);
      return {
        answer: AI_UNAVAILABLE_MESSAGE,
        confidence: AiConfidence.INSUFFICIENT_CONTEXT,
        needsHuman: true,
        priority: EscalationPriority.NORMAL,
        reason: 'openai_call_failed',
        sourceChunkIds: [],
      };
    }
  }

  /** Mock mode: never invents medical facts. Echoes the most relevant approved chunk, or escalates. */
  private mockAnswer(question: string, chunks: RetrievedChunk[]): StructuredAiAnswer {
    if (!chunks.length) {
      return {
        answer: SAFE_ESCALATION_MESSAGE,
        confidence: AiConfidence.INSUFFICIENT_CONTEXT,
        needsHuman: true,
        priority: EscalationPriority.NORMAL,
        reason: 'no_relevant_knowledge_chunks_retrieved',
        sourceChunkIds: [],
      };
    }

    const best = chunks[0];
    return {
      answer: `Based on the clinic's approved information (${best.fileName}${best.sectionTitle ? ' - ' + best.sectionTitle : ''}): ${best.chunkText}`,
      confidence: AiConfidence.SUPPORTED,
      needsHuman: false,
      priority: EscalationPriority.NORMAL,
      reason: 'answered_from_approved_knowledge_mock_mode',
      sourceChunkIds: chunks.map((c) => c.id),
    };
  }

  /**
   * Narrows model-supplied citations to ids of chunks that were actually in the
   * prompt. Anything else - a positional index, a hallucinated id, an id from a
   * document outside this answer's context - is dropped.
   */
  private validCitedChunkIds(cited: unknown, chunks: RetrievedChunk[]): string[] {
    if (!Array.isArray(cited)) return [];
    const supplied = new Set(chunks.map((c) => c.id));
    return cited.filter((id): id is string => typeof id === 'string' && supplied.has(id));
  }
}

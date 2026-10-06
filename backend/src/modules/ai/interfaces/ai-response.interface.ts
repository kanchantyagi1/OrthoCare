import { AiConfidence, EscalationPriority } from '../../../common/enums/escalation.enum';

export interface StructuredAiAnswer {
  answer: string;
  confidence: AiConfidence;
  needsHuman: boolean;
  priority: EscalationPriority;
  reason: string;
  sourceChunkIds: string[];
}

export interface RetrievedChunk {
  id: string;
  chunkText: string;
  fileName: string;
  sectionTitle?: string;
  pageNumber?: number;
  similarity: number;
}

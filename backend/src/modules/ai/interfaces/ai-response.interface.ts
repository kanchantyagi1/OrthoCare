import { AiConfidence, EscalationPriority } from '../../../common/enums/escalation.enum';

export interface StructuredAiAnswer {
  answer: string;
  confidence: AiConfidence;
  needsHuman: boolean;
  priority: EscalationPriority;
  reason: string;
  /** The reply is a question back to the patient (surgery, triage, clarification), not a final answer. */
  awaitingReply?: boolean;
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

import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AiConfidence, EscalationPriority } from '../../../common/enums/escalation.enum';
import { ChatSession } from './chat-session.entity';

@Entity('chat_messages')
export class ChatMessage extends BaseEntity {
  @ManyToOne(() => ChatSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: ChatSession;

  @Column({ name: 'session_id' })
  sessionId: string;

  @Column()
  role: 'patient' | 'assistant';

  @Column({ type: 'text' })
  message: string;

  // --- Fields below are only populated for role = 'assistant' ---
  @Column({ type: 'enum', enum: AiConfidence, nullable: true })
  confidence?: AiConfidence;

  @Column({ name: 'needs_human', default: false })
  needsHuman: boolean;

  @Column({ type: 'enum', enum: EscalationPriority, nullable: true })
  priority?: EscalationPriority;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ name: 'source_chunk_ids', type: 'jsonb', nullable: true })
  sourceChunkIds?: string[];

  @Column({ name: 'similarity_scores', type: 'jsonb', nullable: true })
  similarityScores?: number[];

  @Column({ nullable: true })
  model?: string;

  @Column({ name: 'helpful', nullable: true })
  helpful?: boolean; // patient feedback: true = "Yes, this helped", false = "No, talk to doctor"
}

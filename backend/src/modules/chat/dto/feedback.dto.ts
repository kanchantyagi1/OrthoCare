import { IsBoolean, IsUUID } from 'class-validator';

export class FeedbackDto {
  /** Proves the caller owns the conversation the rated message belongs to. */
  @IsUUID()
  sessionId: string;

  @IsBoolean()
  helpful: boolean;
}

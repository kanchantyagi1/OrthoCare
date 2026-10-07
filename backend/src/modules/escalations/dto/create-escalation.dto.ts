import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateEscalationDto {
  /**
   * The patient's chat session. This is how an account-less patient is identified -
   * the server derives the patient from it, and never accepts a patientId from the
   * client.
   */
  @IsUUID()
  sessionId: string;

  @IsOptional()
  @IsUUID()
  chatMessageId?: string;

  @IsString()
  question: string;

  @IsOptional()
  @IsString()
  aiResponse?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

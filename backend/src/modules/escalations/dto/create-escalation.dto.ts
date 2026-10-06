import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateEscalationDto {
  @IsOptional()
  @IsUUID()
  chatSessionId?: string;

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

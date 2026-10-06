import { IsString, IsUUID, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @MinLength(1)
  message: string;
}

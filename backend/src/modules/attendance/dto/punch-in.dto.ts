import { IsOptional, IsString, IsUUID } from 'class-validator';

export class PunchInDto {
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

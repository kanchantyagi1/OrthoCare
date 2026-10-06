import { IsOptional, IsString } from 'class-validator';

export class PunchOutDto {
  @IsOptional()
  @IsString()
  deviceId?: string;
}

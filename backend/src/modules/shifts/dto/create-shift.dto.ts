import { IsBoolean, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateShiftDto {
  @IsUUID()
  doctorId: string;

  @IsOptional()
  @IsString()
  label?: string;

  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm' })
  startTime: string;

  @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm' })
  endTime: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

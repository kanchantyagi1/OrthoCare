import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ResolveEscalationDto {
  @IsBoolean()
  patientContacted: boolean;

  @IsOptional()
  @IsString()
  issueCategory?: string;

  @IsOptional()
  @IsString()
  resolution?: string;

  @IsOptional()
  @IsBoolean()
  followUpRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  escalateToDoctor?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

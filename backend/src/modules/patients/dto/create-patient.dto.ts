import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreatePatientDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  surgeryType?: string;

  @IsOptional()
  @IsString()
  surgeryDate?: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @IsString()
  preferredLanguage?: string;
}

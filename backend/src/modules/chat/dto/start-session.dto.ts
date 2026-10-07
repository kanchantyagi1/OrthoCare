import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Starts an account-less patient chat. The phone number is the patient's identity. */
export class StartSessionDto {
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

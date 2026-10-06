import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  /// Email address or phone number. Clinic staff (nurses especially) are often
  /// provisioned with a phone number rather than an email, and the app's login
  /// field is labelled "Phone number or email", so this is deliberately not
  /// constrained to @IsEmail().
  @IsString()
  @MinLength(3)
  identifier: string;

  @IsString()
  @MinLength(6)
  password: string;
}

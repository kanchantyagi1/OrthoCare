import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  /**
   * The password in use right now. For a freshly provisioned account this is the
   * temporary password the admin handed over, which is how a doctor or admin moves
   * off it without anyone needing to reset anything server-side.
   */
  @IsString()
  currentPassword: string;

  // Long enough to be worth having, capped because bcrypt silently truncates past
  // 72 bytes - accepting more would let a user set a password whose tail is ignored.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}

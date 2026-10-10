import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../../common/enums/audit-event.enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(identifier: string, password: string) {
    const user = await this.users.findByEmailOrPhone(identifier);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    await this.audit.record(AuditEvent.LOGIN, user.id, { role: user.role });

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async logout(userId: string) {
    await this.audit.record(AuditEvent.LOGOUT, userId);
    return { success: true };
  }

  /**
   * Self-service password change for admins and doctors, and the route off the
   * temporary password a new account is handed over with. Requires the current
   * password rather than just a valid token, so a borrowed/stolen session cannot
   * lock the real owner out of their account.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.users.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      // Same message as a failed login: do not reveal whether it was the password
      // or the account that was wrong.
      throw new UnauthorizedException('Invalid credentials');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException('New password must be different from the current one');
    }

    await this.users.updatePassword(user.id, await AuthService.hashPassword(newPassword));
    await this.audit.record(AuditEvent.PASSWORD_CHANGED, user.id, { role: user.role });

    return { success: true };
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}

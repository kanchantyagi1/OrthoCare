import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuditEvent } from '../../common/enums/audit-event.enum';

describe('AuthService', () => {
  it('logs in successfully with correct credentials and records an audit event', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 4);
    const users = {
      findByEmailOrPhone: jest.fn(async () => ({
        id: 'user-1',
        email: 'doctor@orthocare.demo',
        passwordHash,
        isActive: true,
        fullName: 'Priya',
        role: 'doctor',
      })),
    };
    const jwt = { sign: jest.fn(() => 'signed-jwt-token') };
    const audit = { record: jest.fn() };

    const service = new AuthService(users as any, jwt as any, audit as any);
    const result = await service.login('doctor@orthocare.demo', 'Password123!');

    expect(result.accessToken).toBe('signed-jwt-token');
    expect(result.user.email).toBe('doctor@orthocare.demo');
    expect(audit.record).toHaveBeenCalled();
  });

  it('logs in with a phone number as the identifier, not just an email', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 4);
    const users = {
      findByEmailOrPhone: jest.fn(async (identifier: string) =>
        identifier === '9876543210'
          ? {
              id: 'user-2',
              email: 'priya@orthocare.demo',
              phone: '9876543210',
              passwordHash,
              isActive: true,
              fullName: 'Priya',
              role: 'doctor',
            }
          : null,
      ),
    };
    const jwt = { sign: jest.fn(() => 'signed-jwt-token') };
    const service = new AuthService(users as any, jwt as any, { record: jest.fn() } as any);

    const result = await service.login('9876543210', 'Password123!');

    expect(users.findByEmailOrPhone).toHaveBeenCalledWith('9876543210');
    expect(result.user.id).toBe('user-2');
  });

  it('rejects an incorrect password', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 4);
    const users = {
      findByEmailOrPhone: jest.fn(async () => ({
        id: 'user-1',
        email: 'doctor@orthocare.demo',
        passwordHash,
        isActive: true,
      })),
    };
    const service = new AuthService(users as any, {} as any, { record: jest.fn() } as any);

    await expect(service.login('doctor@orthocare.demo', 'wrong-password')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unknown email without leaking whether the account exists', async () => {
    const users = { findByEmailOrPhone: jest.fn(async () => null) };
    const service = new AuthService(users as any, {} as any, { record: jest.fn() } as any);

    await expect(service.login('nobody@orthocare.demo', 'whatever')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a deactivated account', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 4);
    const users = {
      findByEmailOrPhone: jest.fn(async () => ({ id: 'user-1', passwordHash, isActive: false })),
    };
    const service = new AuthService(users as any, {} as any, { record: jest.fn() } as any);

    await expect(service.login('deactivated@orthocare.demo', 'Password123!')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  describe('changePassword', () => {
    /**
     * Fake user store that behaves like the real one for the only thing that matters
     * here: the stored hash is what login compares against, so after a successful
     * change the old password must stop working and the new one must start.
     */
    function makeUserStore(initialPassword: string) {
      const user: any = {
        id: 'user-1',
        email: 'drmohitkumar79@gmail.com',
        isActive: true,
        fullName: 'Dr. Mohit Kumar',
        role: 'admin',
        passwordHash: bcrypt.hashSync(initialPassword, 4),
      };
      return {
        user,
        findById: jest.fn(async () => user),
        findByEmailOrPhone: jest.fn(async () => user),
        updatePassword: jest.fn(async (_id: string, hash: string) => {
          user.passwordHash = hash;
        }),
      };
    }

    it('moves an account off its temporary password, so the old one stops working', async () => {
      const users = makeUserStore('Password123!');
      const audit = { record: jest.fn() };
      const jwt = { sign: jest.fn(() => 'token') };
      const service = new AuthService(users as any, jwt as any, audit as any);

      const result = await service.changePassword('user-1', 'Password123!', 'a-much-better-secret');
      expect(result.success).toBe(true);
      expect(users.updatePassword).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        AuditEvent.PASSWORD_CHANGED,
        'user-1',
        expect.anything(),
      );

      // The hash was really replaced: new password authenticates, temporary one does not.
      await expect(service.login('drmohitkumar79@gmail.com', 'a-much-better-secret')).resolves.toBeDefined();
      await expect(service.login('drmohitkumar79@gmail.com', 'Password123!')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a wrong current password and leaves the stored hash untouched', async () => {
      const users = makeUserStore('Password123!');
      const service = new AuthService(users as any, {} as any, { record: jest.fn() } as any);
      const hashBefore = users.user.passwordHash;

      await expect(
        service.changePassword('user-1', 'not-the-current-one', 'a-much-better-secret'),
      ).rejects.toThrow(UnauthorizedException);

      expect(users.updatePassword).not.toHaveBeenCalled();
      expect(users.user.passwordHash).toBe(hashBefore);
    });

    it('refuses to "change" a password to the same value', async () => {
      const users = makeUserStore('Password123!');
      const service = new AuthService(users as any, {} as any, { record: jest.fn() } as any);

      await expect(
        service.changePassword('user-1', 'Password123!', 'Password123!'),
      ).rejects.toThrow(BadRequestException);
      expect(users.updatePassword).not.toHaveBeenCalled();
    });
  });
});

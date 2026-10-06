import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('logs in successfully with correct credentials and records an audit event', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 4);
    const users = {
      findByEmail: jest.fn(async () => ({
        id: 'user-1',
        email: 'nurse@orthocare.demo',
        passwordHash,
        isActive: true,
        fullName: 'Priya',
        role: 'nurse',
      })),
    };
    const jwt = { sign: jest.fn(() => 'signed-jwt-token') };
    const audit = { record: jest.fn() };

    const service = new AuthService(users as any, jwt as any, audit as any);
    const result = await service.login('nurse@orthocare.demo', 'Password123!');

    expect(result.accessToken).toBe('signed-jwt-token');
    expect(result.user.email).toBe('nurse@orthocare.demo');
    expect(audit.record).toHaveBeenCalled();
  });

  it('rejects an incorrect password', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 4);
    const users = {
      findByEmail: jest.fn(async () => ({
        id: 'user-1',
        email: 'nurse@orthocare.demo',
        passwordHash,
        isActive: true,
      })),
    };
    const service = new AuthService(users as any, {} as any, { record: jest.fn() } as any);

    await expect(service.login('nurse@orthocare.demo', 'wrong-password')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unknown email without leaking whether the account exists', async () => {
    const users = { findByEmail: jest.fn(async () => null) };
    const service = new AuthService(users as any, {} as any, { record: jest.fn() } as any);

    await expect(service.login('nobody@orthocare.demo', 'whatever')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a deactivated account', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 4);
    const users = {
      findByEmail: jest.fn(async () => ({ id: 'user-1', passwordHash, isActive: false })),
    };
    const service = new AuthService(users as any, {} as any, { record: jest.fn() } as any);

    await expect(service.login('deactivated@orthocare.demo', 'Password123!')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

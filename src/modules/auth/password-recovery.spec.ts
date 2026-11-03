import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { compare } from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { EmailService } from '../../infrastructure/email/email.service.js';

describe('password recovery', () => {
  const user = {
    id: '1',
    emailVerified: true,
    enabled: true,
    accountStatus: 'ACTIVE',
  };
  const findUnique = jest.fn<() => Promise<typeof user | null>>();
  const update =
    jest.fn<(args: { data: { password: string } }) => Promise<void>>();
  const set = jest.fn<() => Promise<string | null>>();
  const evaluate = jest.fn<() => Promise<number>>();
  const send = jest.fn();
  const service = new AuthService(
    { user: { findUnique, update } } as unknown as PrismaService,
    { client: { set, eval: evaluate } } as unknown as RedisService,
    {} as TokenService,
    new ConfigService(),
    { sendPasswordResetInBackground: send } as unknown as EmailService,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue(user);
    set.mockResolvedValue('OK');
    evaluate.mockResolvedValue(1);
    update.mockResolvedValue(undefined);
  });
  it('sends an OTP using a separate Redis key', async () => {
    await service.forgotPassword('user@example.com');
    expect(set).toHaveBeenCalledWith(
      'password-reset:user@example.com',
      expect.stringMatching(/^\d{6}$/),
      'EX',
      600,
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not send mail for an unknown account', async () => {
    findUnique.mockResolvedValue(null);
    await service.forgotPassword('none@example.com');
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects an invalid or used OTP without updating the password', async () => {
    evaluate.mockResolvedValue(0);
    await expect(
      service.resetPassword('user@example.com', '123456', 'password123'),
    ).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
  it('hashes the replacement password after consuming the OTP', async () => {
    await service.resetPassword('user@example.com', '123456', 'password123');
    await expect(
      compare('password123', update.mock.calls[0][0].data.password),
    ).resolves.toBe(true);
  });
});

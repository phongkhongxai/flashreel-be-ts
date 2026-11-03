import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { hashSync } from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { TokenService } from './token.service.js';
import { EmailService } from '../../infrastructure/email/email.service.js';

describe('AuthService login', () => {
  const user = {
    id: 'user-id',
    username: 'testuser',
    password: hashSync('password123', 10),
    emailVerified: true,
    enabled: true,
    accountStatus: 'ACTIVE',
    roles: [{ role: { name: 'USER' } }],
  };
  const findUnique = jest.fn<() => Promise<typeof user | null>>();
  const issue =
    jest.fn<() => Promise<{ accessToken: string; refreshToken: string }>>();
  const service = new AuthService(
    { user: { findUnique } } as unknown as PrismaService,
    {} as RedisService,
    { issue } as unknown as TokenService,
    new ConfigService(),
    {} as EmailService,
  );
  beforeEach(() => {
    findUnique.mockResolvedValue(user);
    issue.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });
  });
  it('accepts a BCrypt password and returns separate tokens', async () => {
    await expect(service.login('testuser', 'password123')).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      username: 'testuser',
      authenticated: true,
    });
  });
  it('rejects an incorrect password', async () => {
    await expect(service.login('testuser', 'wrong')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('exchanges a Google code and issues tokens for an existing user', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'google-token' }),
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ email: 'test@example.com' }),
    } as Response);
    const oauth = new AuthService(
      { user: { findUnique } } as unknown as PrismaService,
      {} as RedisService,
      { issue } as unknown as TokenService,
      new ConfigService({
        GOOGLE_CLIENT_ID: 'client',
        GOOGLE_CLIENT_SECRET: 'secret',
        GOOGLE_REDIRECT_URI: 'http://localhost/callback',
      }),
      {} as EmailService,
    );
    try {
      await expect(oauth.outbound('code', 'verifier')).resolves.toMatchObject({
        accessToken: 'access',
        refreshToken: 'refresh',
        username: 'testuser',
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
    }
  });
});

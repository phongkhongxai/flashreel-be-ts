import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { TokenService } from './token.service.js';

describe('TokenService', () => {
  const revoked = new Set<string>();
  const user = {
    id: 'user-id',
    username: 'user',
    enabled: true,
    accountStatus: 'ACTIVE',
    roles: [{ role: { name: 'USER' } }],
  };
  const prisma = {
    invalidatedToken: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(revoked.has(where.id) ? { id: where.id } : null),
      ),
      create: jest.fn(({ data }: { data: { id: string } }) => {
        revoked.add(data.id);
        return Promise.resolve(data);
      }),
    },
    user: { findUnique: jest.fn(() => Promise.resolve(user)) },
  };
  const jwt = new JwtService({ secret: 'a'.repeat(64) });
  const config = new ConfigService({
    JWT_EXPIRES_IN: 3600,
    JWT_REFRESH_EXPIRES_IN: 7200,
  });
  const service = new TokenService(
    jwt,
    config,
    prisma as unknown as PrismaService,
  );

  beforeEach(() => revoked.clear());

  it('issues separate HS512 tokens and rejects a refresh token as access', async () => {
    const pair = await service.issue({
      id: user.id,
      username: user.username,
      scope: 'ROLE_USER',
    });
    expect(pair.accessToken).not.toBe(pair.refreshToken);
    expect((await service.verify(pair.accessToken, 'access')).sub).toBe(
      user.username,
    );
    await expect(service.verify(pair.refreshToken, 'access')).rejects.toThrow();
    await expect(service.verify(pair.accessToken, 'refresh')).rejects.toThrow();
  });

  it('rotates refresh tokens and rejects replay', async () => {
    const pair = await service.issue({
      id: user.id,
      username: user.username,
      scope: 'ROLE_USER',
    });
    const next = await service.rotate(pair.refreshToken);
    expect(next.refreshToken).not.toBe(pair.refreshToken);
    await expect(service.rotate(pair.refreshToken)).rejects.toThrow();
    expect((await service.verify(next.refreshToken, 'refresh')).scope).toBe(
      'ROLE_USER',
    );
  });

  it('revokes an access token', async () => {
    const pair = await service.issue({
      id: user.id,
      username: user.username,
      scope: 'ROLE_USER',
    });
    await service.revoke(pair.accessToken, 'access');
    await expect(service.verify(pair.accessToken, 'access')).rejects.toThrow();
    await expect(
      service.verify(pair.refreshToken, 'refresh'),
    ).resolves.toBeDefined();
  });
});

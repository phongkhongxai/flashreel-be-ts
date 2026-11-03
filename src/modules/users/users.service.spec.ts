import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { compare } from 'bcryptjs';
import { UsersService } from './users.service.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import { EmailService } from '../../infrastructure/email/email.service.js';

describe('UsersService', () => {
  it('returns fresh signed avatars in user, profile, list and update responses', async () => {
    const user = {
      id: '1',
      username: 'tester',
      nickname: 'Tester',
      avatarUrl: 'private-avatar',
      followerCount: 0,
      followingCount: 0,
      videoCount: 0,
    };
    const db = {
      user: {
        findUnique: jest.fn().mockReturnValue(Promise.resolve(user)),
        findMany: jest.fn().mockReturnValue(Promise.resolve([user])),
        update: jest.fn().mockReturnValue(Promise.resolve(user)),
      },
    };
    const signedAvatarUrl = jest
      .fn()
      .mockReturnValue(Promise.resolve('signed-avatar'));
    const service = new UsersService(
      db as unknown as PrismaService,
      {} as RedisService,
      { signedAvatarUrl } as unknown as StorageService,
      new ConfigService(),
      {} as EmailService,
    );
    expect((await service.byId('1')).avatarUrl).toBe('signed-avatar');
    expect((await service.byUsername('tester')).avatarUrl).toBe(
      'signed-avatar',
    );
    expect((await service.list())[0].avatarUrl).toBe('signed-avatar');
    expect((await service.update('1', {})).avatarUrl).toBe('signed-avatar');
    expect(
      (await service.updateProfile('tester', { nickname: 'Tester' })).avatarUrl,
    ).toBe('signed-avatar');
    expect(signedAvatarUrl).toHaveBeenCalledWith('private-avatar');
  });
  it('registers with a BCrypt hash and stores an expiring OTP in Redis', async () => {
    const create = jest
      .fn<
        (args: {
          data: { password: string };
        }) => Promise<{ id: string; email: string }>
      >()
      .mockResolvedValue({ id: '1', email: 'test@example.com' });
    const findUnique = jest.fn<() => Promise<null>>().mockResolvedValue(null);
    const tx = { user: { create }, role: { findUnique } };
    const db = {
      user: { findUnique },
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
    };
    const set = jest.fn<() => Promise<string>>().mockResolvedValue('OK');
    const service = new UsersService(
      db as unknown as PrismaService,
      { client: { set } } as unknown as RedisService,
      {} as StorageService,
      new ConfigService(),
      { sendVerificationInBackground: jest.fn() } as unknown as EmailService,
    );
    const result = await service.register({
      username: 'tester',
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Tester',
    });
    expect(result).toContain('registered successfully');
    const storedHash = create.mock.calls[0][0].data.password;
    await expect(compare('password123', storedHash)).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith(
      'otp-verify:test@example.com',
      expect.stringMatching(/^\d{6}$/),
      'EX',
      600,
    );
  });

  it('uploads a profile avatar through the configured storage client', async () => {
    const user = { id: '1', username: 'tester', nickname: 'Tester' };
    const findUnique = jest
      .fn<() => Promise<typeof user>>()
      .mockResolvedValue(user);
    const update = jest
      .fn<() => Promise<typeof user>>()
      .mockResolvedValue(user);
    const putObject = jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);
    const service = new UsersService(
      { user: { findUnique, update } } as unknown as PrismaService,
      {} as RedisService,
      {
        client: { putObject },
        bucket: 'avatars',
        signedAvatarUrl: jest
          .fn<(url: string | null) => Promise<string | null>>()
          .mockImplementation(async (url) => url),
      } as unknown as StorageService,
      new ConfigService({ MINIO_PUBLIC_URL: 'http://localhost:9000' }),
      {} as EmailService,
    );
    await service.updateProfile('tester', { nickname: 'New Name' }, {
      originalname: 'avatar.png',
      mimetype: 'image/png',
      size: 3,
      buffer: Buffer.from('abc'),
    } as Express.Multer.File);
    expect(putObject).toHaveBeenCalledWith(
      'avatars',
      expect.stringMatching(/^avatars\/.+-avatar\.png$/),
      Buffer.from('abc'),
      3,
      { 'Content-Type': 'image/png' },
    );
    expect(update).toHaveBeenCalled();
  });
});

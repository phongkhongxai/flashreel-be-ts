import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { randomInt, randomUUID } from 'node:crypto';
import { EmailService } from '../../infrastructure/email/email.service.js';
import type { User } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import { AuthError } from '../auth/auth-error.js';
import type {
  RegistrationDto,
  ProfileDto,
  UpdateUserDto,
} from './users.dto.js';

function response(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    nickname: user.nickname,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    followerCount: Number(user.followerCount),
    followingCount: Number(user.followingCount),
    videoCount: Number(user.videoCount),
    enabled: user.enabled,
    createdAt: user.createdAt,
  };
}
@Injectable()
export class UsersService {
  constructor(
    private readonly db: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}
  private async response(user: User) {
    return {
      ...response(user),
      avatarUrl: await this.storage.signedAvatarUrl(user.avatarUrl),
    };
  }
  async register(dto: RegistrationDto) {
    if (await this.db.user.findUnique({ where: { username: dto.username } }))
      throw new AuthError(1002, 'User existed', 400);
    const old = await this.db.user.findUnique({ where: { email: dto.email } });
    if (old?.emailVerified)
      throw new AuthError(1014, 'Email already verified.', 400);
    const password = await hash(dto.password, 10);
    const now = new Date();
    const otp = String(randomInt(0, 999999)).padStart(6, '0');
    const user = await this.db.$transaction(async (tx) => {
      const save = async () => {
        if (old)
          return tx.user.update({
            where: { id: old.id },
            data: {
              displayName: dto.displayName,
              password,
              avatarUrl:
                'https://api.dicebear.com/7.x/initials/svg?seed=' +
                old.username,
              updatedAt: now,
            },
          });
        const role = await tx.role.findUnique({ where: { name: 'USER' } });
        return tx.user.create({
          data: {
            username: dto.username,
            email: dto.email,
            password,
            displayName: dto.displayName,
            nickname: dto.displayName,
            avatarUrl:
              'https://api.dicebear.com/7.x/initials/svg?seed=' + dto.username,
            emailVerified: false,
            enabled: true,
            locked: false,
            accountStatus: 'ACTIVE',
            followerCount: 0,
            followingCount: 0,
            videoCount: 0,
            createdAt: now,
            updatedAt: now,
            ...(role ? { roles: { create: { roleId: role.name } } } : {}),
          },
        });
      };
      const saved = await save();
      await this.redis.client.set('otp-verify:' + saved.email, otp, 'EX', 600);
      return saved;
    });
    this.email.sendVerificationInBackground(user.email, otp);
    return old
      ? 'Verification code has been resent to your email. Please check your inbox.'
      : 'Account registered successfully! Please check your email for the verification code.';
  }
  async byId(id: string) {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user) throw new AuthError(1005, 'User not existed', 404);
    return this.response(user);
  }
  async byUsername(username: string) {
    const user = await this.db.user.findUnique({ where: { username } });
    if (!user) throw new AuthError(1005, 'User not existed', 404);
    return this.response(user);
  }
  async list() {
    return Promise.all(
      (await this.db.user.findMany()).map((user) => this.response(user)),
    );
  }
  async delete(id: string) {
    await this.db.user.delete({ where: { id } });
    return 'User has been deleted';
  }
  async update(id: string, dto: UpdateUserDto) {
    await this.byId(id);
    return this.response(
      await this.db.user.update({
        where: { id },
        data: {
          displayName: dto.displayName ?? null,
          nickname: dto.nickname as string,
          bio: dto.bio ?? null,
          avatarUrl: dto.avatarUrl ?? null,
          updatedAt: new Date(),
        },
      }),
    );
  }
  async updateProfile(
    username: string,
    dto: ProfileDto,
    file?: Express.Multer.File,
  ) {
    const user = await this.db.user.findUnique({ where: { username } });
    if (!user) throw new AuthError(1005, 'User not existed', 404);
    let avatarUrl = dto.avatarUrl;
    if (file?.size) {
      try {
        const key =
          'avatars/' +
          randomUUID() +
          '-' +
          (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
        await this.storage.client.putObject(
          this.storage.bucket,
          key,
          file.buffer,
          file.size,
          { 'Content-Type': file.mimetype || 'application/octet-stream' },
        );
        avatarUrl =
          this.config
            .getOrThrow<string>('MINIO_PUBLIC_URL')
            .replace(/\/$/, '') +
          '/' +
          this.storage.bucket +
          '/' +
          key;
      } catch {
        throw new AuthError(2014, 'Cannot upload file', 500);
      }
    }
    return this.response(
      await this.db.user.update({
        where: { id: user.id },
        data: {
          nickname: dto.nickname.trim(),
          displayName: dto.nickname.trim(),
          ...(avatarUrl !== undefined ? { avatarUrl } : {}),
          updatedAt: new Date(),
        },
      }),
    );
  }
}

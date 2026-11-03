import { Injectable } from '@nestjs/common';
import { compare } from 'bcryptjs';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { AuthError } from './auth-error.js';
import { TokenService } from './token.service.js';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { randomInt, randomUUID } from 'node:crypto';
import { EmailService } from '../../infrastructure/email/email.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async logout(accessToken?: string, refreshToken?: string): Promise<void> {
    if (!accessToken && !refreshToken)
      throw new AuthError(1006, 'Unauthenticated', 401);
    if (accessToken) await this.tokens.revoke(accessToken, 'access');
    if (refreshToken) await this.tokens.revoke(refreshToken, 'refresh');
  }

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new AuthError(1005, 'User not existed', 404);
    if (!(await compare(password, user.password)))
      throw new AuthError(1006, 'Unauthenticated', 401);
    if (!user.emailVerified)
      throw new AuthError(1009, 'Email is not verified.', 403);
    if (!user.enabled || user.accountStatus === 'CANCELLED')
      throw new AuthError(2011, 'Account has been cancelled', 403);
    const pair = await this.tokens.issue({
      id: user.id,
      username: user.username,
      scope: user.roles.map(({ role }) => `ROLE_${role.name}`).join(' '),
    });
    return { ...pair, username: user.username, authenticated: true };
  }

  async outbound(code: string, codeVerifier: string) {
    const form = new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      client_id: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      client_secret: this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      redirect_uri: this.config.getOrThrow<string>('GOOGLE_REDIRECT_URI'),
      grant_type: 'authorization_code',
    });
    const exchange = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: form,
    });
    if (!exchange.ok) throw new AuthError(1006, 'Unauthenticated', 401);
    const tokenData = (await exchange.json()) as { access_token?: string };
    if (!tokenData.access_token)
      throw new AuthError(1006, 'Unauthenticated', 401);
    const url = new URL('https://www.googleapis.com/oauth2/v1/userinfo');
    url.searchParams.set('alt', 'json');
    url.searchParams.set('access_token', tokenData.access_token);
    const profileResponse = await fetch(url);
    if (!profileResponse.ok) throw new AuthError(1006, 'Unauthenticated', 401);
    const profile = (await profileResponse.json()) as {
      email?: string;
      given_name?: string;
      family_name?: string;
      name?: string;
      picture?: string;
    };
    if (!profile.email) throw new AuthError(1006, 'Unauthenticated', 401);
    let user = await this.prisma.user.findUnique({
      where: { email: profile.email },
      include: { roles: { include: { role: true } } },
    });
    if (!user) {
      let username = profile.email.split('@')[0];
      while (await this.prisma.user.findUnique({ where: { username } }))
        username += Date.now().toString();
      const now = new Date();
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          username,
          password: await hash(randomUUID(), 10),
          firstName: profile.given_name,
          lastName: profile.family_name,
          displayName: profile.name,
          nickname: profile.name || username,
          avatarUrl: profile.picture,
          emailVerified: true,
          enabled: true,
          locked: false,
          accountStatus: 'ACTIVE',
          followerCount: 0,
          followingCount: 0,
          videoCount: 0,
          createdAt: now,
          updatedAt: now,
          roles: { create: { roleId: 'USER' } },
        },
        include: { roles: { include: { role: true } } },
      });
    }
    const pair = await this.tokens.issue({
      id: user.id,
      username: user.username,
      scope: user.roles.map(({ role }) => `ROLE_${role.name}`).join(' '),
    });
    return { ...pair, username: user.username, authenticated: false };
  }

  async refresh(refreshToken: string) {
    const pair = await this.tokens.rotate(refreshToken);
    const claims = await this.tokens.verify(pair.accessToken, 'access');
    return { ...pair, username: claims.sub, authenticated: true };
  }

  async introspect(token: string) {
    try {
      await this.tokens.verify(token, 'access');
      return { valid: true };
    } catch {
      return { valid: false };
    }
  }

  async verifyEmail(email: string, code: string) {
    const key = `otp-verify:${email}`;
    if ((await this.redis.client.get(key)) !== code)
      throw new AuthError(1022, 'OTP invalid.', 400);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new AuthError(1005, 'User not existed', 404);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, updatedAt: new Date() },
    });
    await this.redis.client.del(key);
    return 'Email verified successfully!';
  }

  async resendCode(email: string): Promise<void> {
    const allowed = await this.redis.client.set(
      `otp-resend-limit:${email}`,
      '1',
      'EX',
      60,
      'NX',
    );
    if (!allowed) return;
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerified) return;
    const otp = String(randomInt(0, 1000000)).padStart(6, '0');
    await this.redis.client.set(`otp-verify:${email}`, otp, 'EX', 600);
    this.emailService.sendVerificationInBackground(email, otp);
  }

  async forgotPassword(email: string): Promise<void> {
    const allowed = await this.redis.client.set(
      `password-reset-limit:${email}`,
      '1',
      'EX',
      60,
      'NX',
    );
    if (!allowed) return;
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      !user.emailVerified ||
      !user.enabled ||
      user.accountStatus === 'CANCELLED'
    )
      return;
    const otp = String(randomInt(0, 1000000)).padStart(6, '0');
    await this.redis.client.set(`password-reset:${email}`, otp, 'EX', 600);
    this.emailService.sendPasswordResetInBackground(email, otp);
  }

  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const key = `password-reset:${email}`;
    const attempts = `password-reset-attempts:${email}`;
    const result = await this.redis.client.eval(
      `local code = redis.call('GET', KEYS[1])
       if not code then return 0 end
       local count = redis.call('INCR', KEYS[2])
       if count == 1 then redis.call('EXPIRE', KEYS[2], 600) end
       if count > 5 then return 0 end
       if code ~= ARGV[1] then return 0 end
       redis.call('DEL', KEYS[1], KEYS[2])
       return 1`,
      2,
      key,
      attempts,
      code,
    );
    if (result !== 1) throw new AuthError(1022, 'OTP invalid.', 400);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      !user.emailVerified ||
      !user.enabled ||
      user.accountStatus === 'CANCELLED'
    )
      throw new AuthError(1022, 'OTP invalid.', 400);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: await hash(newPassword, 10), updatedAt: new Date() },
    });
  }
}

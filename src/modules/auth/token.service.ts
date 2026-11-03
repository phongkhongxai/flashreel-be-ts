import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

interface TokenClaims {
  sub: string;
  userId: string;
  jti: string;
  exp: number;
  scope: string;
  tokenType: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issue(user: {
    id: string;
    username: string;
    scope: string;
  }): Promise<TokenPair> {
    const base = { sub: user.username, userId: user.id, scope: user.scope };
    const sign = (tokenType: 'access' | 'refresh', expiresIn: number) =>
      this.jwt.signAsync(
        { ...base, tokenType },
        {
          algorithm: 'HS512',
          issuer: 'phongkoxai.vn',
          jwtid: randomUUID(),
          expiresIn,
        },
      );
    const [accessToken, refreshToken] = await Promise.all([
      sign('access', this.config.getOrThrow<number>('JWT_EXPIRES_IN')),
      sign('refresh', this.config.getOrThrow<number>('JWT_REFRESH_EXPIRES_IN')),
    ]);
    return { accessToken, refreshToken };
  }

  async verify(
    token: string,
    type: 'access' | 'refresh',
  ): Promise<TokenClaims> {
    try {
      const claims = await this.jwt.verifyAsync<TokenClaims>(token, {
        algorithms: ['HS512'],
        issuer: 'phongkoxai.vn',
      });
      if (
        claims.tokenType !== type ||
        typeof claims.sub !== 'string' ||
        typeof claims.userId !== 'string' ||
        typeof claims.jti !== 'string' ||
        typeof claims.exp !== 'number'
      )
        throw new UnauthorizedException();
      if (
        await this.prisma.invalidatedToken.findUnique({
          where: { id: claims.jti },
        })
      )
        throw new UnauthorizedException();
      return claims;
    } catch {
      throw new UnauthorizedException();
    }
  }

  async rotate(token: string): Promise<TokenPair> {
    const claims = await this.verify(token, 'refresh');
    const user = await this.prisma.user.findUnique({
      where: { id: claims.userId },
      include: { roles: { include: { role: true } } },
    });
    if (
      !user ||
      user.username !== claims.sub ||
      !user.enabled ||
      user.accountStatus === 'CANCELLED'
    )
      throw new UnauthorizedException();
    try {
      await this.prisma.invalidatedToken.create({
        data: { id: claims.jti, expiryTime: new Date(claims.exp * 1000) },
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new UnauthorizedException();
      throw error;
    }
    return this.issue({
      id: user.id,
      username: user.username,
      scope: user.roles.map(({ role }) => `ROLE_${role.name}`).join(' '),
    });
  }

  async revoke(token: string, type: 'access' | 'refresh'): Promise<void> {
    const claims = await this.verify(token, type);
    try {
      await this.prisma.invalidatedToken.create({
        data: { id: claims.jti, expiryTime: new Date(claims.exp * 1000) },
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      )
        throw new UnauthorizedException();
      throw error;
    }
  }
}

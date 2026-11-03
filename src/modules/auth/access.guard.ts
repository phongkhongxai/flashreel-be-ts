import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { TokenService } from './token.service.js';
import { AuthError } from './auth-error.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { AuthPrincipal } from './auth-principal.js';

export interface AuthenticatedRequest extends Request {
  principal: AuthPrincipal;
}

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly db: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer '))
      throw new AuthError(1006, 'Unauthenticated', 401);
    try {
      const claims = await this.tokens.verify(header.slice(7), 'access');
      const user = await this.db.user.findUnique({
        where: { id: claims.userId },
      });
      if (
        !user ||
        user.username !== claims.sub ||
        !user.enabled ||
        user.accountStatus === 'CANCELLED'
      )
        throw new AuthError(1006, 'Unauthenticated', 401);
      request.principal = {
        sub: claims.sub,
        userId: claims.userId,
        scope: claims.scope,
      };
      return true;
    } catch {
      throw new AuthError(1006, 'Unauthenticated', 401);
    }
  }
}

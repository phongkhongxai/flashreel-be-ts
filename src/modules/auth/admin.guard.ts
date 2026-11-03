import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from './access.guard.js';
import { AuthError } from './auth-error.js';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.principal.scope?.split(' ').includes('ROLE_ADMIN'))
      throw new AuthError(1007, 'You do not have permission', 403);
    return true;
  }
}

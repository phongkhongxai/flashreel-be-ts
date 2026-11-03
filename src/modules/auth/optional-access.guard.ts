import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AccessGuard } from './access.guard.js';

@Injectable()
export class OptionalAccessGuard implements CanActivate {
  constructor(private readonly accessGuard: AccessGuard) {}

  canActivate(context: ExecutionContext): Promise<boolean> | boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers.authorization === undefined) return true;
    return this.accessGuard.canActivate(context);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import {
  activeActor,
  serializable,
} from '../../infrastructure/database/transaction.js';
import type { AuthPrincipal } from '../auth/auth-principal.js';
import { AuthError } from '../auth/auth-error.js';
import type { ConfirmDto } from './account.dto.js';
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly redis: RedisService,
  ) {}
  async request(principal: AuthPrincipal) {
    const user = await this.db.user.findUnique({
      where: { id: principal.userId },
    });
    if (!user || !user.enabled || user.accountStatus === 'CANCELLED')
      throw new AuthError(2011, 'Account has been cancelled', 403);
    await this.redis.client.set(
      'account-cancellation:' + user.id,
      'requested',
      'EX',
      600,
    );
    return {
      code: 1000,
      result:
        'Account cancellation requested. Please confirm within 10 minutes.',
    };
  }
  async confirm(principal: AuthPrincipal, body: ConfirmDto) {
    if (!body.confirmed)
      throw new AuthError(2012, 'Confirmation is required', 400);
    const key = 'account-cancellation:' + principal.userId;
    if (!(await this.redis.client.exists(key)))
      throw new AuthError(2012, 'Confirmation is required', 400);
    await serializable(this.db, async (tx) => {
      const user = await activeActor(tx, principal.userId, principal.sub);
      const suffix = randomUUID();
      await tx.user.update({
        where: { id: user.id },
        data: {
          nickname: 'Deleted User',
          displayName: 'Deleted User',
          avatarUrl: null,
          bio: null,
          username: 'deleted-' + suffix,
          email: 'deleted-' + suffix + '@deleted.local',
          enabled: false,
          accountStatus: 'CANCELLED',
          updatedAt: new Date(),
        },
      });
      await tx.video.updateMany({
        where: { authorId: user.id },
        data: { status: 'TAKEN_DOWN' },
      });
    });
    try {
      await this.redis.client.del(key);
    } catch {
      this.logger.warn('Could not remove cancellation key; it will expire');
    }
    return { code: 1000, result: 'Account has been cancelled.' };
  }
}

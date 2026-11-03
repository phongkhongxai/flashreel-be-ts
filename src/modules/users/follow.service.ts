import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  activeActor,
  serializable,
} from '../../infrastructure/database/transaction.js';
import type { AuthPrincipal } from '../auth/auth-principal.js';
import { AuthError } from '../auth/auth-error.js';
@Injectable()
export class FollowService {
  constructor(private readonly db: PrismaService) {}
  async status(principal: AuthPrincipal, authorId: string) {
    const relation = await this.db.userFollow.findUnique({
      where: {
        followerId_authorId: { followerId: principal.userId, authorId },
      },
      select: { id: true },
    });
    return { following: Boolean(relation) };
  }
  async change(principal: AuthPrincipal, authorId: string, follow: boolean) {
    await serializable(this.db, async (tx) => {
      const actor = await activeActor(tx, principal.userId, principal.sub);
      if (follow && actor.id === authorId)
        throw new AuthError(2010, 'You cannot follow yourself', 400);
      if (follow && !(await tx.user.findUnique({ where: { id: authorId } })))
        throw new AuthError(1005, 'User not existed', 404);
      const where = { followerId_authorId: { followerId: actor.id, authorId } };
      const relation = await tx.userFollow.findUnique({ where });
      if (follow && !relation) {
        await tx.userFollow.create({
          data: { followerId: actor.id, authorId, createdAt: new Date() },
        });
        await tx.user.update({
          where: { id: actor.id },
          data: { followingCount: { increment: 1 } },
        });
        await tx.user.update({
          where: { id: authorId },
          data: { followerCount: { increment: 1 } },
        });
      } else if (!follow && relation) {
        await tx.userFollow.delete({ where });
        await tx.user.updateMany({
          where: { id: actor.id, followingCount: { gt: 0 } },
          data: { followingCount: { decrement: 1 } },
        });
        await tx.user.updateMany({
          where: { id: authorId, followerCount: { gt: 0 } },
          data: { followerCount: { decrement: 1 } },
        });
      }
    });
    return { code: 1000 };
  }
}

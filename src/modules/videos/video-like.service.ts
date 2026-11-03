import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  activeActor,
  serializable,
} from '../../infrastructure/database/transaction.js';
import type { AuthPrincipal } from '../auth/auth-principal.js';
import { AuthError } from '../auth/auth-error.js';
@Injectable()
export class VideoLikeService {
  constructor(private readonly db: PrismaService) {}
  async change(principal: AuthPrincipal, id: string, liked: boolean) {
    return serializable(this.db, async (tx) => {
      const actor = await activeActor(tx, principal.userId, principal.sub);
      const video = await tx.video.findUnique({ where: { id } });
      if (!video) throw new AuthError(2001, 'Video not existed', 404);
      if (liked && video.status !== 'APPROVED')
        throw new AuthError(2006, 'Video is not approved', 400);
      const where = { userId_videoId: { userId: actor.id, videoId: id } };
      const existing = await tx.videoLike.findUnique({ where });
      if (liked && !existing) {
        await tx.videoLike.create({
          data: { userId: actor.id, videoId: id, createdAt: new Date() },
        });
        await tx.video.update({
          where: { id },
          data: { likeCount: { increment: 1 } },
        });
      } else if (!liked && existing) {
        await tx.videoLike.delete({ where });
        await tx.video.updateMany({
          where: { id, likeCount: { gt: 0 } },
          data: { likeCount: { decrement: 1 } },
        });
      }
      const result = await tx.video.findUniqueOrThrow({ where: { id } });
      return {
        code: 1000,
        result: { videoId: id, liked, likeCount: Number(result.likeCount) },
      };
    });
  }
}

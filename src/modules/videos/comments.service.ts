import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  activeActor,
  serializable,
} from '../../infrastructure/database/transaction.js';
import type { AuthPrincipal } from '../auth/auth-principal.js';
import { AuthError } from '../auth/auth-error.js';
import { pagination } from './pagination.js';
import type { CommentDto } from './comments.dto.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
@Injectable()
export class CommentsService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
  ) {}
  private async approved(id: string) {
    const v = await this.db.video.findUnique({ where: { id } });
    if (!v) throw new AuthError(2001, 'Video not existed', 404);
    if (v.status !== 'APPROVED')
      throw new AuthError(2006, 'Video is not approved', 400);
  }
  private async map(
    c: Prisma.VideoCommentGetPayload<{ include: { author: true } }>,
  ) {
    return {
      id: c.id,
      videoId: c.videoId,
      authorId: c.authorId,
      authorNickname: c.author.nickname,
      authorAvatar: await this.storage.signedAvatarUrl(c.author.avatarUrl),
      content: c.content,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
  async list(videoId: string, page?: string, size?: string) {
    const p = pagination(page, size);
    await this.approved(videoId);
    const where = { videoId, status: 'VISIBLE' as const };
    const [items, totalElements] = await this.db.$transaction([
      this.db.videoComment.findMany({
        where,
        include: { author: true },
        orderBy: { createdAt: 'desc' },
        skip: p.page * p.size,
        take: p.size,
      }),
      this.db.videoComment.count({ where }),
    ]);
    const totalPages = Math.ceil(totalElements / p.size);
    return {
      code: 1000,
      result: {
        content: await Promise.all(items.map((x) => this.map(x))),
        ...p,
        totalElements,
        totalPages,
        last: p.page >= totalPages - 1,
      },
    };
  }
  async cursor(videoId: string, cursor?: string, size?: string) {
    const limit = pagination(undefined, size).size;
    await this.approved(videoId);
    let parts: string[] | undefined;
    if (cursor?.trim()) {
      if (!/^[A-Za-z0-9_-]+$/.test(cursor))
        throw new AuthError(2016, 'Invalid cursor', 400);
      parts = Buffer.from(cursor, 'base64url').toString().split('|');
      if (
        parts.length !== 2 ||
        !parts[1] ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(parts[0]) ||
        Number.isNaN(Date.parse(parts[0]))
      )
        throw new AuthError(2016, 'Invalid cursor', 400);
    }
    const timestamp = parts?.[0].replace('T', ' ').replace('Z', '');
    const condition = parts
      ? Prisma.sql`AND (c.created_at < CAST(${timestamp} AS DATETIME(6)) OR (c.created_at = CAST(${timestamp} AS DATETIME(6)) AND c.id < ${parts[1]}))`
      : Prisma.empty;
    const rows = await this.db.$queryRaw<
      { id: string; stamp: string }[]
    >`SELECT c.id, DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS stamp FROM video_comments c WHERE c.video_id = ${videoId} AND c.status = 'VISIBLE' ${condition} ORDER BY c.created_at DESC, c.id DESC LIMIT ${limit + 1}`;
    const ids = rows.slice(0, limit);
    const comments = await this.db.videoComment.findMany({
      where: { id: { in: ids.map((x) => x.id) }, status: 'VISIBLE' },
      include: { author: true },
    });
    const map = new Map(comments.map((c) => [c.id, c]));
    const last = ids.at(-1);
    const hasNext = rows.length > limit;
    return {
      code: 1000,
      result: {
        data: await Promise.all(
          ids.flatMap((x) => {
            const c = map.get(x.id);
            return c ? [this.map(c)] : [];
          }),
        ),
        hasNext,
        nextCursor:
          hasNext && last
            ? Buffer.from(last.stamp + '|' + last.id).toString('base64url')
            : null,
      },
    };
  }
  async create(principal: AuthPrincipal, videoId: string, body: CommentDto) {
    const result = await serializable(this.db, async (tx) => {
      const user = await activeActor(tx, principal.userId, principal.sub);
      const video = await tx.video.findUnique({ where: { id: videoId } });
      if (!video) throw new AuthError(2001, 'Video not existed', 404);
      if (video.status !== 'APPROVED')
        throw new AuthError(2006, 'Video is not approved', 400);
      const now = new Date();
      const comment = await tx.videoComment.create({
        data: {
          videoId,
          authorId: user.id,
          content: body.content.trim(),
          status: 'VISIBLE',
          createdAt: now,
          updatedAt: now,
        },
        include: { author: true },
      });
      await tx.video.update({
        where: { id: videoId },
        data: { commentCount: { increment: 1 } },
      });
      return comment;
    });
    return { code: 1000, result: await this.map(result) };
  }
  async remove(principal: AuthPrincipal, videoId: string, commentId: string) {
    await serializable(this.db, async (tx) => {
      const user = await activeActor(tx, principal.userId, principal.sub);
      const comment = await tx.videoComment.findUnique({
        where: { id: commentId },
      });
      if (!comment || comment.videoId !== videoId)
        throw new AuthError(2101, 'Comment not existed', 404);
      if (
        comment.authorId !== user.id &&
        !principal.scope
          ?.split(' ')
          .some((x) => ['ROLE_ADMIN', 'ROLE_REVIEWER'].includes(x))
      )
        throw new AuthError(2103, 'You cannot access this comment', 403);
      const result = await tx.videoComment.updateMany({
        where: { id: commentId, status: 'VISIBLE' },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      if (result.count)
        await tx.video.updateMany({
          where: { id: videoId, commentCount: { gt: 0 } },
          data: { commentCount: { decrement: 1 } },
        });
    });
    return { code: 1000 };
  }
}

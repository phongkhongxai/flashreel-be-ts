import { Injectable } from '@nestjs/common';
import { Prisma, VideoStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuthError } from '../auth/auth-error.js';
import { VideoMediaService } from './video-media.service.js';
import {
  activeActor,
  serializable,
} from '../../infrastructure/database/transaction.js';

type VideoWithAuthor = Prisma.VideoGetPayload<{ include: { author: true } }>;
function videoResponse(v: VideoWithAuthor) {
  return {
    id: v.id,
    title: v.title,
    videoUrl: v.videoUrl,
    coverUrl: v.coverUrl,
    authorId: v.authorId,
    authorNickname: v.author.nickname,
    status: v.status,
    rejectReason: v.rejectReason,
    likeCount: Number(v.likeCount),
    viewCount: Number(v.viewCount),
    commentCount: Number(v.commentCount),
    publishedAt: v.publishedAt,
    approvedAt: v.approvedAt,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}
function reviewResponse(v: VideoWithAuthor) {
  return {
    id: v.id,
    title: v.title,
    authorNickname: v.author.nickname,
    authorEmail: v.author.email,
    authorAvatar: v.author.avatarUrl,
    uploadTime: v.createdAt,
    videoPreviewUrl: v.videoUrl,
    coverUrl: v.coverUrl,
    likeCount: Number(v.likeCount),
    viewCount: Number(v.viewCount),
    commentCount: Number(v.commentCount),
    status: v.status,
  };
}
function parseCursor(
  cursor: string | undefined,
  fields: number,
): string[] | null {
  if (!cursor?.trim()) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const parts = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (parts.length !== fields || parts.some((part) => !part))
      throw new Error();
    return parts;
  } catch {
    throw new AuthError(2016, 'Invalid cursor', 400);
  }
}
function cursorDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new AuthError(2016, 'Invalid cursor', 400);
  return date;
}
function encodeCursor(parts: (string | Date)[]) {
  return Buffer.from(
    parts.map((p) => (p instanceof Date ? p.toISOString() : p)).join('|'),
  ).toString('base64url');
}
@Injectable()
export class VideosService {
  constructor(
    private readonly db: PrismaService,
    private readonly media: VideoMediaService,
  ) {}
  private async response(video: VideoWithAuthor) {
    const [videoUrl, coverUrl] = await Promise.all([
      this.media.signedUrl(video.videoUrl),
      this.media.signedUrl(video.coverUrl),
    ]);
    return { ...videoResponse(video), videoUrl, coverUrl };
  }
  private async review(video: VideoWithAuthor) {
    const [videoPreviewUrl, coverUrl, authorAvatar] = await Promise.all([
      this.media.signedUrl(video.videoUrl),
      this.media.signedUrl(video.coverUrl),
      video.author.avatarUrl
        ? this.media.signedAvatarUrl(video.author.avatarUrl)
        : null,
    ]);
    return {
      ...reviewResponse(video),
      videoPreviewUrl,
      coverUrl,
      authorAvatar,
    };
  }
  private async activeUser(username: string) {
    const user = await this.db.user.findUnique({ where: { username } });
    if (!user) throw new AuthError(1005, 'User not existed', 404);
    if (!user.enabled || user.accountStatus === 'CANCELLED')
      throw new AuthError(2011, 'Account has been cancelled', 403);
    return user;
  }
  async publish(username: string, title: string, file: Express.Multer.File) {
    const author = await this.activeUser(username);
    if (!title?.trim() || title.length > 60)
      throw new AuthError(
        2002,
        'Video title must be between 1 and 60 characters',
        400,
      );
    const media = await this.media.upload(file);
    const now = new Date();
    const video = await this.db.$transaction(async (tx) => {
      const video = await tx.video.create({
        data: {
          title: title.trim(),
          ...media,
          authorId: author.id,
          status: 'REVIEWING',
          likeCount: 0,
          viewCount: 0,
          commentCount: 0,
          publishedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        include: { author: true },
      });
      await tx.user.update({
        where: { id: author.id },
        data: { videoCount: { increment: 1 } },
      });
      return video;
    });
    return this.response(video);
  }
  async resubmit(
    username: string,
    id: string,
    title?: string,
    file?: Express.Multer.File,
  ) {
    const user = await this.activeUser(username);
    const old = await this.find(id);
    if (old.authorId !== user.id)
      throw new AuthError(2007, 'You cannot access this video', 403);
    if (old.status !== 'REJECTED')
      throw new AuthError(2013, 'Only rejected videos can be resubmitted', 400);
    if (title !== undefined && (title.length < 1 || title.length > 60))
      throw new AuthError(
        2002,
        'Video title must be between 1 and 60 characters',
        400,
      );
    const replacement = file?.size ? await this.media.upload(file) : null;
    const updated = await serializable(this.db, async (tx) => {
      await activeActor(tx, user.id, username);
      const current = await tx.video.findUnique({ where: { id } });
      if (
        !current ||
        current.authorId !== user.id ||
        current.status !== 'REJECTED'
      )
        throw new AuthError(
          2013,
          'Only rejected videos can be resubmitted',
          400,
        );
      const [likes, comments] = await Promise.all([
        tx.videoLike.count({ where: { videoId: id } }),
        tx.videoComment.count({ where: { videoId: id, status: 'VISIBLE' } }),
      ]);
      return tx.video.update({
        where: { id },
        data: {
          title: title?.trim() || old.title,
          ...(replacement ?? {}),
          status: 'REVIEWING',
          rejectReason: null,
          approvedAt: null,
          likeCount: likes,
          commentCount: comments,
          publishedAt: new Date(),
          updatedAt: new Date(),
        },
        include: { author: true },
      });
    });
    if (replacement) {
      await this.media.delete(old.videoUrl);
      if (old.coverUrl !== old.videoUrl) await this.media.delete(old.coverUrl);
    }
    return this.response(updated);
  }
  private async find(id: string) {
    const video = await this.db.video.findUnique({
      where: { id },
      include: { author: true },
    });
    if (!video) throw new AuthError(2001, 'Video not existed', 404);
    return video;
  }
  async detail(id: string, username?: string, scope = '') {
    const video = await this.find(id);
    if (video.status !== 'APPROVED') {
      if (!username) throw new AuthError(2006, 'Video is not approved', 400);
      const user = await this.db.user.findUnique({ where: { username } });
      if (!user) throw new AuthError(1005, 'User not existed', 404);
      if (
        video.authorId !== user.id &&
        !scope
          .split(' ')
          .some((role) => role === 'ROLE_ADMIN' || role === 'ROLE_REVIEWER')
      )
        throw new AuthError(2006, 'Video is not approved', 400);
    }
    return this.response(video);
  }
  async playback(id: string, username?: string) {
    const user = username
      ? await this.db.user.findUnique({ where: { username } })
      : null;
    if (username && !user) throw new AuthError(1005, 'User not existed', 404);
    const video = await this.find(id);
    if (video.status !== 'APPROVED' && video.authorId !== user?.id)
      throw new AuthError(2006, 'Video is not approved', 400);
    const [like, follow] = user
      ? await Promise.all([
          this.db.videoLike.findUnique({
            where: { userId_videoId: { userId: user.id, videoId: id } },
          }),
          this.db.userFollow.findUnique({
            where: {
              followerId_authorId: {
                followerId: user.id,
                authorId: video.authorId,
              },
            },
          }),
        ])
      : [null, null];
    return {
      id: video.id,
      title: video.title,
      videoUrl: await this.media.signedUrl(video.videoUrl),
      coverUrl: await this.media.signedUrl(video.coverUrl),
      authorId: video.authorId,
      authorAvatar: video.author.avatarUrl
        ? await this.media.signedAvatarUrl(video.author.avatarUrl)
        : null,
      authorNickname: video.author.nickname,
      likeCount: Number(video.likeCount),
      viewCount: Number(video.viewCount),
      commentCount: Number(video.commentCount),
      liked: !!like,
      followingAuthor: !!follow,
    };
  }

  async mine(
    username: string,
    status: VideoStatus | undefined,
    page: number,
    size: number,
  ) {
    const user = await this.db.user.findUnique({ where: { username } });
    if (!user) throw new AuthError(1005, 'User not existed', 404);
    const where = { authorId: user.id, ...(status ? { status } : {}) };
    const [videos, totalElements] = await this.db.$transaction([
      this.db.video.findMany({
        where,
        include: { author: true },
        orderBy: { createdAt: 'desc' },
        skip: page * size,
        take: size,
      }),
      this.db.video.count({ where }),
    ]);
    const totalPages = Math.ceil(totalElements / size);
    return {
      content: await Promise.all(videos.map((video) => this.response(video))),
      page,
      size,
      totalElements,
      totalPages,
      last: page >= totalPages - 1,
    };
  }

  async feed(page: number, size: number) {
    const ids = await this.db.$queryRaw<{ id: string }[]>`
      SELECT v.id FROM videos v WHERE v.status = 'APPROVED'
      ORDER BY (v.like_count + v.view_count - (TIMESTAMPDIFF(HOUR, v.approved_at, CURRENT_TIMESTAMP) * ${0.1})) DESC,
      v.approved_at DESC LIMIT ${size} OFFSET ${page * size}`;
    const [videos, totalElements] = await Promise.all([
      this.db.video.findMany({
        where: { id: { in: ids.map((v) => v.id) } },
        include: { author: true },
      }),
      this.db.video.count({ where: { status: 'APPROVED' } }),
    ]);
    const byId = new Map(videos.map((v) => [v.id, v]));
    const totalPages = Math.ceil(totalElements / size);
    return {
      content: await Promise.all(
        ids.flatMap(({ id }) => {
          const v = byId.get(id);
          return v ? [this.response(v)] : [];
        }),
      ),
      page,
      size,
      totalElements,
      totalPages,
      last: page >= totalPages - 1,
    };
  }
  async latestCursor(cursor: string | undefined, size: number) {
    const parts = parseCursor(cursor, 3);
    const approvedAt = parts ? cursorDate(parts[0]) : null;
    const createdAt = parts ? cursorDate(parts[1]) : null;
    const where: Prisma.VideoWhereInput = {
      status: 'APPROVED',
      ...(parts && approvedAt && createdAt
        ? {
            OR: [
              { approvedAt: { lt: approvedAt } },
              { approvedAt, createdAt: { lt: createdAt } },
              { approvedAt, createdAt, id: { lt: parts[2] } },
            ],
          }
        : {}),
    };
    const videos = await this.db.video.findMany({
      where,
      include: { author: true },
      orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: size + 1,
    });
    const hasNext = videos.length > size;
    const page = videos.slice(0, size);
    const last = page.at(-1);
    return {
      data: await Promise.all(page.map((video) => this.response(video))),
      nextCursor:
        hasNext && last?.approvedAt
          ? encodeCursor([last.approvedAt, last.createdAt, last.id])
          : null,
      hasNext,
    };
  }
  async feedCursor(cursor: string | undefined, size: number) {
    const parts = parseCursor(cursor, 4);
    const asOf = parts ? cursorDate(parts[0]) : new Date();
    const score = parts ? Number(parts[1]) : null;
    const approvedAt = parts ? cursorDate(parts[2]) : null;
    if (parts && (score === null || !Number.isFinite(score)))
      throw new AuthError(2016, 'Invalid cursor', 400);
    const expr = Prisma.sql`(v.like_count + v.view_count - TIMESTAMPDIFF(HOUR, v.approved_at, ${asOf}) * ${0.1})`;
    const filter =
      parts && approvedAt !== null
        ? Prisma.sql`
      AND (${expr} < ${score} OR (${expr} = ${score} AND v.approved_at < ${approvedAt})
      OR (${expr} = ${score} AND v.approved_at = ${approvedAt} AND v.id < ${parts[3]}))`
        : Prisma.empty;
    const ids = await this.db.$queryRaw<{ id: string }[]>`
      SELECT v.id FROM videos v WHERE v.status = 'APPROVED' ${filter}
      ORDER BY ${expr} DESC, v.approved_at DESC, v.id DESC LIMIT ${size + 1}`;
    const videos = await this.db.video.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      include: { author: true },
    });
    const map = new Map(videos.map((video) => [video.id, video]));
    const hasNext = ids.length > size;
    const page = ids.slice(0, size).flatMap(({ id }) => {
      const video = map.get(id);
      return video ? [video] : [];
    });
    const last = page.at(-1);
    const hours = last?.approvedAt
      ? Math.trunc((asOf.getTime() - last.approvedAt.getTime()) / 3600000)
      : 0;
    const lastScore = last
      ? Number(last.likeCount) + Number(last.viewCount) - hours * 0.1
      : 0;
    return {
      data: await Promise.all(page.map((video) => this.response(video))),
      nextCursor:
        hasNext && last?.approvedAt
          ? encodeCursor([asOf, String(lastScore), last.approvedAt, last.id])
          : null,
      hasNext,
    };
  }
  async userVideosCursor(
    userId: string,
    cursor: string | undefined,
    size: number,
  ) {
    const parts = parseCursor(cursor, 2);
    const createdAt = parts ? cursorDate(parts[0]) : null;
    const where: Prisma.VideoWhereInput = {
      authorId: userId,
      status: 'APPROVED',
      ...(parts && createdAt
        ? {
            OR: [
              { createdAt: { lt: createdAt } },
              { createdAt, id: { lt: parts[1] } },
            ],
          }
        : {}),
    };
    const videos = await this.db.video.findMany({
      where,
      include: { author: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: size + 1,
    });
    const hasNext = videos.length > size;
    const page = videos.slice(0, size);
    const last = page.at(-1);
    return {
      data: await Promise.all(page.map((video) => this.response(video))),
      nextCursor:
        hasNext && last ? encodeCursor([last.createdAt, last.id]) : null,
      hasNext,
    };
  }
  async mineCursor(
    username: string,
    status: VideoStatus | undefined,
    cursor: string | undefined,
    size: number,
  ) {
    const user = await this.db.user.findUnique({ where: { username } });
    if (!user) throw new AuthError(1005, 'User not existed', 404);
    const parts = parseCursor(cursor, 2);
    const createdAt = parts ? cursorDate(parts[0]) : null;
    const where: Prisma.VideoWhereInput = {
      authorId: user.id,
      ...(status ? { status } : {}),
      ...(parts && createdAt
        ? {
            OR: [
              { createdAt: { lt: createdAt } },
              { createdAt, id: { lt: parts[1] } },
            ],
          }
        : {}),
    };
    const videos = await this.db.video.findMany({
      where,
      include: { author: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: size + 1,
    });
    const hasNext = videos.length > size;
    const page = videos.slice(0, size);
    const last = page.at(-1);
    return {
      data: await Promise.all(page.map((video) => this.response(video))),
      nextCursor:
        hasNext && last ? encodeCursor([last.createdAt, last.id]) : null,
      hasNext,
    };
  }
  async view(id: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await this.db.video.updateMany({
        where: { id, status: 'APPROVED' },
        data: { viewCount: { increment: 1 } },
      });
      if (result.count) return;
      const video = await this.find(id);
      if (video.status !== 'APPROVED')
        throw new AuthError(2006, 'Video is not approved', 400);
    }
    throw new Error('Could not record video view');
  }
  async latest(page: number, size: number) {
    const where = { status: VideoStatus.APPROVED };
    const [videos, totalElements] = await this.db.$transaction([
      this.db.video.findMany({
        where,
        include: { author: true },
        orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
        skip: page * size,
        take: size,
      }),
      this.db.video.count({ where }),
    ]);
    const totalPages = Math.ceil(totalElements / size);
    return {
      content: await Promise.all(videos.map((video) => this.response(video))),
      page,
      size,
      totalElements,
      totalPages,
      last: page >= totalPages - 1,
    };
  }
  async adminList(status: VideoStatus | undefined, page: number, size: number) {
    const where = status ? { status } : {};
    const [videos, totalElements] = await this.db.$transaction([
      this.db.video.findMany({
        where,
        include: { author: true },
        orderBy: { createdAt: 'desc' },
        skip: page * size,
        take: size,
      }),
      this.db.video.count({ where }),
    ]);
    const totalPages = Math.ceil(totalElements / size);
    return {
      content: await Promise.all(videos.map((video) => this.review(video))),
      page,
      size,
      totalElements,
      totalPages,
      last: page >= totalPages - 1,
    };
  }
  async moderate(
    id: string,
    action: 'approve' | 'reject' | 'take-down',
    reason?: string,
  ) {
    await this.find(id);
    const data: Prisma.VideoUpdateInput =
      action === 'approve'
        ? { status: 'APPROVED', approvedAt: new Date(), rejectReason: null }
        : action === 'reject'
          ? { status: 'REJECTED', approvedAt: null, rejectReason: reason }
          : { status: 'TAKEN_DOWN' };
    return this.response(
      await this.db.video.update({
        where: { id },
        data: { ...data, updatedAt: new Date() },
        include: { author: true },
      }),
    );
  }
}

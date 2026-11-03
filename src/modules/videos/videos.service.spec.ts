import { jest } from '@jest/globals';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { VideosService } from './videos.service.js';
import { pagination } from './pagination.js';
import { VideoMediaService } from './video-media.service.js';

describe('VideosService', () => {
  it('signs author avatars in playback and admin review responses', async () => {
    const video = {
      id: 'v1',
      title: 'Video',
      status: 'APPROVED',
      authorId: 'owner',
      author: {
        nickname: 'Creator',
        avatarUrl: 'private-avatar',
        email: 'creator@example.test',
      },
      videoUrl: 'video',
      coverUrl: null,
      likeCount: 0n,
      viewCount: 0n,
      commentCount: 0n,
    };
    const db = {
      video: {
        findUnique: jest.fn().mockReturnValue(Promise.resolve(video)),
        findMany: jest.fn().mockReturnValue(Promise.resolve([video])),
        count: jest.fn().mockReturnValue(Promise.resolve(1)),
      },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    };
    const signedUrl = jest
      .fn()
      .mockReturnValue(Promise.resolve('signed-video'));
    const signedAvatarUrl = jest
      .fn()
      .mockReturnValue(Promise.resolve('signed-avatar'));
    const videos = new VideosService(
      db as unknown as PrismaService,
      { signedUrl, signedAvatarUrl } as unknown as VideoMediaService,
    );
    expect((await videos.playback('v1')).authorAvatar).toBe('signed-avatar');
    expect(
      (await videos.adminList(undefined, 0, 10)).content[0].authorAvatar,
    ).toBe('signed-avatar');
    expect(signedAvatarUrl).toHaveBeenCalledWith('private-avatar');
  });
  const findUnique = jest.fn<() => Promise<{ status: string } | null>>();
  const updateMany = jest.fn<() => Promise<{ count: number }>>();
  const service = new VideosService(
    {
      video: { findUnique, updateMany },
    } as unknown as PrismaService,
    {} as VideoMediaService,
  );

  it('rejects views of unapproved videos', async () => {
    findUnique.mockResolvedValue({ status: 'REVIEWING' });
    updateMany.mockResolvedValue({ count: 0 });
    await expect(service.view('video')).rejects.toMatchObject({ status: 400 });
  });

  it('increments views with an approved-status condition', async () => {
    findUnique.mockResolvedValue({ status: 'APPROVED' });
    updateMany.mockResolvedValue({ count: 1 });
    await service.view('video');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'video', status: 'APPROVED' },
      data: { viewCount: { increment: 1 } },
    });
  });

  it('uses zero-based pagination and rejects invalid sizes', () => {
    expect(pagination(undefined, undefined)).toEqual({ page: 0, size: 20 });
    expect(() => pagination('0', '0')).toThrow();
  });

  it('rejects an invalid cursor before querying the database', async () => {
    await expect(service.latestCursor('invalid!', 20)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('lists only approved videos for the requested author with a stable cursor', async () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    const makeVideo = (id: string) => ({
      id,
      createdAt: date,
      authorId: 'creator',
      status: 'APPROVED',
      title: id,
      videoUrl: 'video',
      coverUrl: null,
      author: { nickname: 'Creator' },
      likeCount: 0n,
      viewCount: 0n,
      commentCount: 0n,
    });
    const findMany = jest
      .fn()
      .mockReturnValue(Promise.resolve([makeVideo('b'), makeVideo('a')]));
    const signedUrl = jest
      .fn<(url: string | null) => Promise<string | null>>()
      .mockImplementation(async (url) => url && `signed:${url}`);
    const videos = new VideosService(
      { video: { findMany } } as unknown as PrismaService,
      { signedUrl } as unknown as VideoMediaService,
    );
    const first = await videos.userVideosCursor('creator', undefined, 1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authorId: 'creator', status: 'APPROVED' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 2,
      }),
    );
    expect(first).toMatchObject({
      hasNext: true,
      data: [{ id: 'b', videoUrl: 'signed:video' }],
    });
    expect(first.nextCursor).toBeTruthy();
    await videos.userVideosCursor('creator', first.nextCursor!, 1);
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          authorId: 'creator',
          status: 'APPROVED',
          OR: [
            { createdAt: { lt: date } },
            { createdAt: date, id: { lt: 'b' } },
          ],
        },
      }),
    );
    await expect(
      videos.userVideosCursor('creator', 'invalid!', 1),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects publishing for a cancelled account', async () => {
    const db = {
      user: {
        findUnique: jest
          .fn()
          .mockReturnValue(
            Promise.resolve({ enabled: false, accountStatus: 'CANCELLED' }),
          ),
      },
    };
    const videos = new VideosService(
      db as unknown as PrismaService,
      {} as VideoMediaService,
    );
    await expect(
      videos.publish('user', 'Title', {} as Express.Multer.File),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects resubmission by a non-owner', async () => {
    const db = {
      user: {
        findUnique: jest.fn().mockReturnValue(
          Promise.resolve({
            id: 'user',
            enabled: true,
            accountStatus: 'ACTIVE',
          }),
        ),
      },
      video: {
        findUnique: jest
          .fn()
          .mockReturnValue(
            Promise.resolve({ authorId: 'other', status: 'REJECTED' }),
          ),
      },
    };
    const videos = new VideosService(
      db as unknown as PrismaService,
      {} as VideoMediaService,
    );
    await expect(videos.resubmit('user', 'video')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('does not sign an unapproved video for an unrelated user', async () => {
    const sign = jest.fn();
    const db = {
      user: {
        findUnique: jest.fn().mockReturnValue(Promise.resolve({ id: 'other' })),
      },
      video: {
        findUnique: jest
          .fn()
          .mockReturnValue(
            Promise.resolve({ authorId: 'owner', status: 'REVIEWING' }),
          ),
      },
    };
    const videos = new VideosService(
      db as unknown as PrismaService,
      { signedUrl: sign } as unknown as VideoMediaService,
    );
    await expect(
      videos.detail('video', 'user', 'ROLE_USER'),
    ).rejects.toMatchObject({ status: 400 });
    expect(sign).not.toHaveBeenCalled();
  });

  it('allows guests to view approved playback with no interaction flags', async () => {
    const db = {
      video: {
        findUnique: jest.fn().mockReturnValue(
          Promise.resolve({
            id: 'v',
            title: 'Video',
            status: 'APPROVED',
            authorId: 'owner',
            author: { nickname: 'Author', avatarUrl: null },
            videoUrl: 'video',
            coverUrl: null,
            likeCount: 1n,
            viewCount: 2n,
            commentCount: 3n,
          }),
        ),
      },
    };
    const signedUrl = jest
      .fn<(url: string | null) => Promise<string | null>>()
      .mockImplementation(async (url) => (url ? 'signed-video' : null));
    const videos = new VideosService(
      db as unknown as PrismaService,
      { signedUrl } as unknown as VideoMediaService,
    );
    await expect(videos.playback('v')).resolves.toMatchObject({
      videoUrl: 'signed-video',
      liked: false,
      followingAuthor: false,
    });
  });

  it('does not issue signed playback URLs for an unapproved video to a guest', async () => {
    const db = {
      video: {
        findUnique: jest
          .fn()
          .mockReturnValue(
            Promise.resolve({ status: 'REVIEWING', authorId: 'owner' }),
          ),
      },
    };
    const signedUrl = jest.fn();
    const videos = new VideosService(
      db as unknown as PrismaService,
      { signedUrl } as unknown as VideoMediaService,
    );
    await expect(videos.playback('v')).rejects.toMatchObject({ status: 400 });
    expect(signedUrl).not.toHaveBeenCalled();
  });

  it('signs both media URLs in my videos and preserves missing thumbnails', async () => {
    const video = {
      id: 'v1',
      videoUrl: 'original-video',
      coverUrl: 'original-cover',
      author: { nickname: 'Author' },
      likeCount: 0n,
      viewCount: 0n,
      commentCount: 0n,
    };
    const missingCover = { ...video, id: 'v2', coverUrl: null };
    const db = {
      user: { findUnique: () => Promise.resolve({ id: 'owner' }) },
      video: {
        findMany: () => Promise.resolve([video, missingCover]),
        count: () => Promise.resolve(2),
      },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    };
    const signedUrl = jest
      .fn<(url: string | null) => Promise<string | null>>()
      .mockImplementation(async (url) => (url ? `signed:${url}` : null));
    const videos = new VideosService(
      db as unknown as PrismaService,
      { signedUrl } as unknown as VideoMediaService,
    );
    const result = await videos.mine('owner', undefined, 0, 20);
    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toMatchObject({
      videoUrl: 'signed:original-video',
      coverUrl: 'signed:original-cover',
    });
    expect(result.content[1].coverUrl).toBeNull();
  });

  it('signs media in my videos cursor results', async () => {
    const video = {
      id: 'v1',
      videoUrl: 'original-video',
      coverUrl: 'original-cover',
      author: { nickname: 'Author' },
      likeCount: 0n,
      viewCount: 0n,
      commentCount: 0n,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const db = {
      user: { findUnique: () => Promise.resolve({ id: 'owner' }) },
      video: { findMany: () => Promise.resolve([video]) },
    };
    const signedUrl = jest
      .fn<(url: string | null) => Promise<string | null>>()
      .mockImplementation(async (url) => (url ? `signed:${url}` : null));
    const videos = new VideosService(
      db as unknown as PrismaService,
      { signedUrl } as unknown as VideoMediaService,
    );
    const result = await videos.mineCursor('owner', undefined, undefined, 20);
    expect(result.data[0]).toMatchObject({
      videoUrl: 'signed:original-video',
      coverUrl: 'signed:original-cover',
    });
  });
});

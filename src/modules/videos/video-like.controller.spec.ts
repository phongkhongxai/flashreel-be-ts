import { jest } from '@jest/globals';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { AuthenticatedRequest } from '../auth/access.guard.js';
import { VideoLikeService } from './video-like.service.js';

describe('video like', () => {
  it('does not increment the counter when the like already exists', async () => {
    const update = jest.fn();
    const tx = {
      user: {
        findUnique: () =>
          Promise.resolve({
            id: 'u',
            username: 'user',
            enabled: true,
            accountStatus: 'ACTIVE',
          }),
      },
      video: {
        findUnique: () => Promise.resolve({ id: 'v', status: 'APPROVED' }),
        findUniqueOrThrow: () => Promise.resolve({ likeCount: 2n }),
        update,
      },
      videoLike: { findUnique: () => Promise.resolve({ id: 'existing' }) },
    };
    const db = {
      $transaction: (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx),
    } as unknown as PrismaService;
    const controller = new VideoLikeService(db);
    const req = {
      principal: { userId: 'u', sub: 'user', scope: '' },
    } as AuthenticatedRequest;
    await expect(controller.change(req.principal, 'v', true)).resolves.toEqual({
      code: 1000,
      result: { videoId: 'v', liked: true, likeCount: 2 },
    });
    expect(update).not.toHaveBeenCalled();
  });
});

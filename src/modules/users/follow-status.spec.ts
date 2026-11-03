import { jest } from '@jest/globals';
import { FollowService } from './follow.service.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';

describe('FollowService.status', () => {
  it('uses the authenticated user as the follower', async () => {
    const findUnique = jest
      .fn()
      .mockReturnValue(Promise.resolve({ id: 'relation' }));
    const service = new FollowService({
      userFollow: { findUnique },
    } as unknown as PrismaService);
    await expect(
      service.status(
        { sub: 'viewer', userId: 'viewer-id', scope: 'ROLE_USER' },
        'creator-id',
      ),
    ).resolves.toEqual({ following: true });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        followerId_authorId: {
          followerId: 'viewer-id',
          authorId: 'creator-id',
        },
      },
      select: { id: true },
    });
    findUnique.mockReturnValue(Promise.resolve(null));
    await expect(
      service.status(
        { sub: 'viewer', userId: 'viewer-id', scope: 'ROLE_USER' },
        'creator-id',
      ),
    ).resolves.toEqual({ following: false });
  });
});

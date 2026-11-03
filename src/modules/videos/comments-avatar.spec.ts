import { jest } from '@jest/globals';
import { CommentsService } from './comments.service.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { StorageService } from '../../infrastructure/storage/storage.service.js';

describe('comment avatars', () => {
  it('returns a signed author avatar in comment responses', async () => {
    const comment = {
      id: 'c1',
      videoId: 'v1',
      authorId: 'u1',
      content: 'hello',
      createdAt: new Date(),
      updatedAt: new Date(),
      author: { nickname: 'Tester', avatarUrl: 'private-avatar' },
    };
    const db = {
      video: {
        findUnique: jest
          .fn()
          .mockReturnValue(Promise.resolve({ status: 'APPROVED' })),
      },
      videoComment: {
        findMany: jest.fn().mockReturnValue(Promise.resolve([comment])),
        count: jest.fn().mockReturnValue(Promise.resolve(1)),
      },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    };
    const signedAvatarUrl = jest
      .fn()
      .mockReturnValue(Promise.resolve('signed-avatar'));
    const service = new CommentsService(
      db as unknown as PrismaService,
      { signedAvatarUrl } as unknown as StorageService,
    );
    const response = await service.list('v1');
    expect(response.result.content[0].authorAvatar).toBe('signed-avatar');
    expect(signedAvatarUrl).toHaveBeenCalledWith('private-avatar');
  });
});

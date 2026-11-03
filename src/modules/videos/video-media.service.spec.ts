import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import { VideoMediaService } from './video-media.service.js';

describe('video signed URLs', () => {
  it('signs a video object for 15 minutes and leaves null covers empty', async () => {
    const sign = jest
      .fn<() => Promise<string>>()
      .mockResolvedValue('signed-url');
    const service = new VideoMediaService(
      {
        bucket: 'short-videos',
        publicClient: { presignedGetObject: sign },
      } as unknown as StorageService,
      new ConfigService(),
    );
    await expect(
      service.signedUrl('http://old-host/short-videos/videos/clip.mp4'),
    ).resolves.toBe('signed-url');
    expect(sign).toHaveBeenCalledWith('short-videos', 'videos/clip.mp4', 900);
    await expect(service.signedUrl(null)).resolves.toBeNull();
    await expect(
      service.signedUrl('http://host/other-bucket/videos/clip.mp4'),
    ).rejects.toThrow();
  });
});

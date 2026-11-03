import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service.js';

describe('avatar URLs', () => {
  const storage = new StorageService(
    new ConfigService({
      MINIO_ENDPOINT: 'localhost',
      MINIO_PORT: 9000,
      MINIO_USE_SSL: false,
      MINIO_ACCESS_KEY: 'access',
      MINIO_SECRET_KEY: 'secret',
      MINIO_BUCKET: 'short-videos',
      MINIO_PUBLIC_URL: 'https://storage.example.test',
    }),
  );
  const sign = jest.spyOn(storage.publicClient, 'presignedGetObject');
  beforeEach(() => {
    sign.mockReset();
    sign.mockResolvedValue('https://storage.example.test/signed');
  });
  it('signs local avatars for 15 minutes using the client-facing host', async () => {
    await expect(
      storage.signedAvatarUrl(
        'http://localhost:9000/short-videos/avatars/profile.png',
      ),
    ).resolves.toBe('https://storage.example.test/signed');
    expect(sign).toHaveBeenCalledWith(
      'short-videos',
      'avatars/profile.png',
      900,
    );
  });
  it('preserves external and null avatars without signing them', async () => {
    const external = 'https://api.dicebear.com/avatar.svg';
    await expect(storage.signedAvatarUrl(external)).resolves.toBe(external);
    await expect(storage.signedAvatarUrl(null)).resolves.toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });
  it('re-signs an old signed avatar without keeping its expired query', async () => {
    await expect(
      storage.signedAvatarUrl(
        'https://storage.example.test/short-videos/avatars/profile.png?X-Amz-Signature=expired&X-Amz-Expires=900',
      ),
    ).resolves.toBe('https://storage.example.test/signed');
    expect(sign).toHaveBeenCalledWith(
      'short-videos',
      'avatars/profile.png',
      900,
    );
  });
  it('does not mistake an external URL with the same bucket path for an internal object', async () => {
    const external = 'https://other.test/short-videos/avatars/example.png';
    await expect(storage.signedAvatarUrl(external)).resolves.toBe(external);
    expect(sign).not.toHaveBeenCalled();
  });
});

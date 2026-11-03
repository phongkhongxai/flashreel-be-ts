import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

@Injectable()
export class StorageService {
  readonly client: Client;
  readonly publicClient: Client;
  readonly bucket: string;
  private readonly avatarOrigins: Set<string>;
  constructor(config: ConfigService) {
    this.client = new Client({
      endPoint: config.getOrThrow<string>('MINIO_ENDPOINT'),
      port: config.getOrThrow<number>('MINIO_PORT'),
      useSSL: config.getOrThrow<boolean>('MINIO_USE_SSL'),
      accessKey: config.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretKey: config.getOrThrow<string>('MINIO_SECRET_KEY'),
    });
    this.bucket = config.getOrThrow<string>('MINIO_BUCKET');
    const publicUrl = new URL(config.getOrThrow<string>('MINIO_PUBLIC_URL'));
    if (
      publicUrl.pathname !== '/' ||
      publicUrl.search ||
      publicUrl.hash ||
      publicUrl.username ||
      publicUrl.password
    )
      throw new Error(
        'MINIO_PUBLIC_URL must be an origin without a path, credentials, query or fragment',
      );
    this.publicClient = new Client({
      endPoint: publicUrl.hostname,
      port: Number(
        publicUrl.port || (publicUrl.protocol === 'https:' ? 443 : 80),
      ),
      useSSL: publicUrl.protocol === 'https:',
      accessKey: config.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretKey: config.getOrThrow<string>('MINIO_SECRET_KEY'),
    });
    const internalScheme = config.getOrThrow<boolean>('MINIO_USE_SSL')
      ? 'https'
      : 'http';
    const internalHost = config.getOrThrow<string>('MINIO_ENDPOINT');
    const internalPort = config.getOrThrow<number>('MINIO_PORT');
    this.avatarOrigins = new Set([
      publicUrl.origin,
      new URL(`${internalScheme}://${internalHost}:${internalPort}`).origin,
    ]);
  }

  async signedAvatarUrl(url: string | null): Promise<string | null> {
    if (!url) return null;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return url;
    }
    const prefix = `/${this.bucket}/avatars/`;
    if (
      !this.avatarOrigins.has(parsed.origin) ||
      !parsed.pathname.startsWith(prefix)
    )
      return url;
    const key = decodeURIComponent(
      parsed.pathname.slice(this.bucket.length + 2),
    );
    return this.publicClient.presignedGetObject(this.bucket, key, 900);
  }
}

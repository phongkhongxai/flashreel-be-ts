import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import { AuthError } from '../auth/auth-error.js';

@Injectable()
export class VideoMediaService {
  private readonly logger = new Logger(VideoMediaService.name);
  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async upload(file: Express.Multer.File) {
    if (!file?.size)
      throw new AuthError(2003, 'Video format must be MP4 or MOV', 400);
    if (file.size > 300 * 1024 * 1024)
      throw new AuthError(2005, 'Video file must not exceed 300 MB', 400);
    if (
      !/\.(mp4|mov)$/i.test(file.originalname || '') &&
      !['video/mp4', 'video/quicktime'].includes(
        (file.mimetype || '').toLowerCase(),
      )
    )
      throw new AuthError(2003, 'Video format must be MP4 or MOV', 400);
    const videoUrl = await this.put(
      'videos',
      file.originalname,
      file.buffer,
      file.mimetype,
    );
    let coverUrl: string | null = null;
    let thumbnail: Buffer | undefined;
    let dir: string | undefined;
    try {
      dir = await mkdtemp(join(tmpdir(), 'flashreel-video-'));
      const input = join(dir, 'input.video');
      const output = join(dir, 'thumbnail.jpg');
      await writeFile(input, file.buffer);
      await promisify(execFile)(
        this.config.get<string>('FFMPEG_PATH') || 'ffmpeg',
        [
          '-y',
          '-ss',
          String(randomInt(0, 4)),
          '-i',
          input,
          '-frames:v',
          '1',
          '-q:v',
          '2',
          output,
        ],
        { timeout: 15000 },
      );
      thumbnail = await readFile(output);
    } catch (error) {
      this.logger.warn(
        'Unable to create thumbnail',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true });
    }
    if (thumbnail?.length)
      coverUrl = await this.put(
        'thumbnails',
        randomUUID() + '.jpg',
        thumbnail,
        'image/jpeg',
      );
    return { videoUrl, coverUrl };
  }
  private async put(
    directory: string,
    name: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const publicUrl = this.config
      .getOrThrow<string>('MINIO_PUBLIC_URL')
      .replace(/\/$/, '');
    const key =
      directory +
      '/' +
      randomUUID() +
      '-' +
      (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    try {
      await this.storage.client.putObject(
        this.storage.bucket,
        key,
        buffer,
        buffer.length,
        { 'Content-Type': contentType || 'application/octet-stream' },
      );
      return publicUrl + '/' + this.storage.bucket + '/' + key;
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : 'unknown';
      this.logger.error(`Storage upload failed (code: ${code})`);
      throw new AuthError(2014, 'Cannot upload file', 500);
    }
  }
  async delete(url: string | null): Promise<void> {
    if (!url) return;
    const path = new URL(url).pathname.replace(/^\//, '');
    const prefix = this.storage.bucket + '/';
    const key = path.startsWith(prefix) ? path.slice(prefix.length) : path;
    try {
      await this.storage.client.removeObject(
        this.storage.bucket,
        decodeURIComponent(key),
      );
    } catch {
      throw new AuthError(2014, 'Cannot upload file', 500);
    }
  }
  async signedUrl(url: string | null): Promise<string | null> {
    if (!url) return null;
    const path = new URL(url).pathname.replace(/^\//, '');
    const prefix = this.storage.bucket + '/';
    if (!path.startsWith(prefix))
      throw new AuthError(2014, 'Cannot access file', 500);
    const key = decodeURIComponent(path.slice(prefix.length));
    if (!key.startsWith('videos/') && !key.startsWith('thumbnails/'))
      throw new AuthError(2014, 'Cannot access file', 500);
    return this.storage.publicClient.presignedGetObject(
      this.storage.bucket,
      key,
      900,
    );
  }
  signedAvatarUrl(url: string | null): Promise<string | null> {
    return this.storage.signedAvatarUrl(url);
  }
}

import { jest } from '@jest/globals';
import {
  UnauthorizedException,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessGuard } from '../auth/access.guard.js';
import { OptionalAccessGuard } from '../auth/optional-access.guard.js';
import { VideosController } from './videos.controller.js';
import { VideosService } from './videos.service.js';
import { TokenService } from '../auth/token.service.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

describe('public video playback', () => {
  let app: INestApplication;
  const playback = jest.fn<() => Promise<unknown>>().mockResolvedValue({
    videoUrl: 'signed-url',
    liked: false,
    followingAuthor: false,
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VideosController],
      providers: [
        { provide: VideosService, useValue: { playback } },
        OptionalAccessGuard,
        { provide: TokenService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        {
          provide: AccessGuard,
          useValue: {
            canActivate: (context: ExecutionContext) => {
              const req = context
                .switchToHttp()
                .getRequest<{ headers: { authorization?: string } }>();
              if (req.headers.authorization !== 'Bearer valid')
                throw new UnauthorizedException();
              return true;
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());

  it('allows playback without a token', async () => {
    await request(app.getHttpServer())
      .get('/videos/v/playback')
      .expect(200)
      .expect({
        code: 1000,
        result: {
          videoUrl: 'signed-url',
          liked: false,
          followingAuthor: false,
        },
      });
    expect(playback).toHaveBeenCalledWith('v', undefined);
  });
  it('rejects an invalid token instead of silently treating it as a guest', async () => {
    await request(app.getHttpServer())
      .get('/videos/v/playback')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });
});

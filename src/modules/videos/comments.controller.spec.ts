import { jest } from '@jest/globals';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AccessGuard } from '../auth/access.guard.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

describe('CommentsController', () => {
  let app: INestApplication;
  const create = jest.fn<() => Promise<unknown>>().mockResolvedValue({
    code: 1000,
    result: { id: 'comment-1', content: 'Hello' },
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [{ provide: CommentsService, useValue: { create } }],
    })
      .overrideGuard(AccessGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): { principal: unknown } };
        }) => {
          context.switchToHttp().getRequest().principal = {
            sub: 'user',
            userId: 'user-1',
            scope: 'ROLE_USER',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => app.close());

  it('passes the authenticated principal, video ID and content to the service', async () => {
    await request(app.getHttpServer())
      .post('/videos/video-1/comments')
      .send({ content: 'Hello' })
      .expect(200)
      .expect({ code: 1000, result: { id: 'comment-1', content: 'Hello' } });
    expect(create).toHaveBeenCalledWith(
      { sub: 'user', userId: 'user-1', scope: 'ROLE_USER' },
      'video-1',
      { content: 'Hello' },
    );
  });

  it('rejects blank content before calling the service', async () => {
    create.mockClear();
    await request(app.getHttpServer())
      .post('/videos/video-1/comments')
      .send({ content: '   ' })
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });
});

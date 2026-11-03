import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { AccessGuard } from '../auth/access.guard.js';
import { AuthError } from '../auth/auth-error.js';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter.js';

describe('Users API', () => {
  let app: INestApplication;
  let scope = '';
  const users = {
    list: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    register: jest.fn<() => Promise<string>>().mockResolvedValue('registered'),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: users }],
    })
      .overrideGuard(AccessGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): { principal: unknown } };
        }) => {
          context.switchToHttp().getRequest().principal = {
            sub: 'user',
            scope,
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: () => new AuthError(1001, 'Uncategorized error', 400),
      }),
    );
    await app.init();
  });
  afterAll(async () => app.close());

  it('rejects invalid registration input', async () => {
    await request(app.getHttpServer())
      .post('/users/registration')
      .send({
        username: 'bad',
        password: 'short',
        email: 'bad',
        displayName: '',
      })
      .expect(400)
      .expect({ code: 1001, message: 'Uncategorized error' });
  });

  it('documents bearer authentication only on protected routes', () => {
    const config = new DocumentBuilder()
      .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'access-token')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    expect(document.paths['/users/my-info'].get?.security).toEqual([
      { 'access-token': [] },
    ]);
    expect(
      document.paths['/users/registration'].post?.security,
    ).toBeUndefined();
  });
  it('requires ADMIN for listing users', async () => {
    scope = 'ROLE_USER';
    await request(app.getHttpServer()).get('/users').expect(403);
    scope = 'ROLE_ADMIN';
    await request(app.getHttpServer())
      .get('/users')
      .expect(200)
      .expect({ code: 1000, result: [] });
  });
});

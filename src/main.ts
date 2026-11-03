import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AuthError } from './modules/auth/auth-error.js';
import { ProfileDto } from './modules/users/users.dto.js';
import { CommentDto } from './modules/videos/comments.dto.js';
import { ConfirmDto } from './modules/account/account.dto.js';
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const origins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({
    origin: origins.includes('*') ? '*' : origins,
    credentials: false,
    exposedHeaders: ['Authorization'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        errors[0]?.target instanceof ProfileDto
          ? new AuthError(
              1021,
              'Nickname must not be blank and must not exceed 100 characters',
              400,
            )
          : errors[0]?.target instanceof CommentDto
            ? new AuthError(
                2102,
                'Comment content must not be blank and must not exceed 500 characters',
                400,
              )
            : errors[0]?.target instanceof ConfirmDto
              ? new AuthError(2012, 'Confirmation is required', 400)
              : new AuthError(1001, 'Uncategorized error', 400),
    }),
  );
  app.enableShutdownHooks();
  const documentConfig = new DocumentBuilder()
    .setTitle('Flashreel API')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, documentConfig),
    { swaggerOptions: { persistAuthorization: true } },
  );
  await app.listen(config.getOrThrow<number>('PORT'));
}
await bootstrap();

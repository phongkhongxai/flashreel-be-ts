import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../infrastructure/database/prisma.module.js';
import { TokenService } from './token.service.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { RedisModule } from '../../infrastructure/redis/redis.module.js';
import { AccessGuard } from './access.guard.js';
import { RolesController } from './roles.controller.js';
import { EmailModule } from '../../infrastructure/email/email.module.js';
import { RolesService } from './roles.service.js';
import { AdminGuard } from './admin.guard.js';
import { OptionalAccessGuard } from './optional-access.guard.js';
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    EmailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS512',
          expiresIn: config.getOrThrow<number>('JWT_EXPIRES_IN'),
        },
      }),
    }),
  ],
  controllers: [AuthController, RolesController],
  providers: [
    TokenService,
    AuthService,
    AccessGuard,
    OptionalAccessGuard,
    AdminGuard,
    RolesService,
  ],
  exports: [
    JwtModule,
    TokenService,
    AccessGuard,
    OptionalAccessGuard,
    AdminGuard,
  ],
})
export class AuthModule {}

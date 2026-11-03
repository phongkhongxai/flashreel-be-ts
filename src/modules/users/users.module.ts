import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/database/prisma.module.js';
import { RedisModule } from '../../infrastructure/redis/redis.module.js';
import { StorageModule } from '../../infrastructure/storage/storage.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { EmailModule } from '../../infrastructure/email/email.module.js';
import { FollowService } from './follow.service.js';
import { FollowController } from './follow.controller.js';
@Module({
  imports: [PrismaModule, RedisModule, StorageModule, AuthModule, EmailModule],
  controllers: [UsersController, FollowController],
  providers: [UsersService, FollowService],
})
export class UsersModule {}

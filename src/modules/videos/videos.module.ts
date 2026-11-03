import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { VideosController } from './videos.controller.js';
import {
  VideoAdminController,
  ReviewerGuard,
} from './video-admin.controller.js';
import { VideosService } from './videos.service.js';
import { StorageModule } from '../../infrastructure/storage/storage.module.js';
import { VideoMediaService } from './video-media.service.js';
import { VideoLikeController } from './video-like.controller.js';
import { CommentsService } from './comments.service.js';
import { VideoLikeService } from './video-like.service.js';
import { CommentsController } from './comments.controller.js';
@Module({
  imports: [PrismaModule, AuthModule, StorageModule],
  controllers: [
    VideosController,
    VideoAdminController,
    VideoLikeController,
    CommentsController,
  ],
  providers: [
    VideosService,
    ReviewerGuard,
    VideoMediaService,
    VideoLikeService,
    CommentsService,
  ],
})
export class VideosModule {}

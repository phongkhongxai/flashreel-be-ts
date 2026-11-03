import {
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  AccessGuard,
  type AuthenticatedRequest,
} from '../auth/access.guard.js';
import { VideoLikeService } from './video-like.service.js';
@Controller('videos/:id/like')
@ApiBearerAuth('access-token')
@UseGuards(AccessGuard)
export class VideoLikeController {
  constructor(private readonly service: VideoLikeService) {}
  @Post() @HttpCode(200) like(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.change(req.principal, id, true);
  }
  @Delete() @HttpCode(200) unlike(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.change(req.principal, id, false);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  AccessGuard,
  type AuthenticatedRequest,
} from '../auth/access.guard.js';
import { CommentDto } from './comments.dto.js';
import { CommentsService } from './comments.service.js';
@Controller('videos/:videoId/comments')
@UseGuards(AccessGuard)
@ApiBearerAuth('access-token')
export class CommentsController {
  constructor(private readonly service: CommentsService) {}
  @Get() list(
    @Param('videoId') id: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.service.list(id, page, size);
  }
  @Get('cursor') cursor(
    @Param('videoId') id: string,
    @Query('cursor') cursor?: string,
    @Query('size') size?: string,
  ) {
    return this.service.cursor(id, cursor, size);
  }
  @Post() @HttpCode(200) create(
    @Req() req: AuthenticatedRequest,
    @Param('videoId') id: string,
    @Body() body: CommentDto,
  ) {
    return this.service.create(req.principal, id, body);
  }
  @Delete(':commentId') @HttpCode(200) remove(
    @Req() req: AuthenticatedRequest,
    @Param('videoId') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.service.remove(req.principal, id, commentId);
  }
}

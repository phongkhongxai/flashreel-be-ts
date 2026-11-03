import {
  Controller,
  Body,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  AccessGuard,
  type AuthenticatedRequest,
} from '../auth/access.guard.js';
import { VideoStatus } from '@prisma/client';
import { AuthError } from '../auth/auth-error.js';
import { VideosService } from './videos.service.js';
import { OptionalAccessGuard } from '../auth/optional-access.guard.js';
class PublishDto {
  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  title!: string;
}
class ResubmitDto {
  @ApiProperty({ maxLength: 60, required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  title?: string;
}
import { pagination } from './pagination.js';
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}
  @Post()
  @HttpCode(200)
  @UseGuards(AccessGuard)
  @ApiBearerAuth('access-token')
  @UseInterceptors(
    FileInterceptor('videoFile', { limits: { fileSize: 300 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'videoFile'],
      properties: {
        title: { type: 'string', maxLength: 60 },
        videoFile: { type: 'string', format: 'binary' },
      },
    },
  })
  async publish(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PublishDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return {
      code: 1000,
      result: await this.videos.publish(req.principal.sub, dto.title, file),
    };
  }
  @Post(':id/resubmit')
  @HttpCode(200)
  @UseGuards(AccessGuard)
  @ApiBearerAuth('access-token')
  @UseInterceptors(
    FileInterceptor('videoFile', { limits: { fileSize: 300 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 60 },
        videoFile: { type: 'string', format: 'binary' },
      },
    },
  })
  async resubmit(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ResubmitDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return {
      code: 1000,
      result: await this.videos.resubmit(
        req.principal.sub,
        id,
        dto.title,
        file,
      ),
    };
  }
  @Get('feed/cursor')
  async feedCursor(
    @Query('cursor') cursor?: string,
    @Query('size') size?: string,
  ) {
    return {
      code: 1000,
      result: await this.videos.feedCursor(
        cursor,
        pagination(undefined, size).size,
      ),
    };
  }
  @Get('latest/cursor')
  async latestCursor(
    @Query('cursor') cursor?: string,
    @Query('size') size?: string,
  ) {
    return {
      code: 1000,
      result: await this.videos.latestCursor(
        cursor,
        pagination(undefined, size).size,
      ),
    };
  }
  @Get('my/cursor')
  @UseGuards(AccessGuard)
  @ApiBearerAuth('access-token')
  async mineCursor(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: VideoStatus,
    @Query('cursor') cursor?: string,
    @Query('size') size?: string,
  ) {
    if (status && !Object.values(VideoStatus).includes(status))
      throw new AuthError(1001, 'Uncategorized error', 400);
    return {
      code: 1000,
      result: await this.videos.mineCursor(
        req.principal.sub,
        status,
        cursor,
        pagination(undefined, size).size,
      ),
    };
  }
  @Get('users/:userId/cursor')
  async userVideosCursor(
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
    @Query('size') size?: string,
  ) {
    return {
      code: 1000,
      result: await this.videos.userVideosCursor(
        userId,
        cursor,
        pagination(undefined, size).size,
      ),
    };
  }
  @Get('feed') async feed(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const p = pagination(page, size);
    return { code: 1000, result: await this.videos.feed(p.page, p.size) };
  }
  @Get('my')
  @UseGuards(AccessGuard)
  @ApiBearerAuth('access-token')
  async mine(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: VideoStatus,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    if (status && !Object.values(VideoStatus).includes(status))
      throw new AuthError(1001, 'Uncategorized error', 400);
    const p = pagination(page, size);
    return {
      code: 1000,
      result: await this.videos.mine(req.principal.sub, status, p.page, p.size),
    };
  }
  @Get('latest') async latest(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    const p = pagination(page, size);
    return { code: 1000, result: await this.videos.latest(p.page, p.size) };
  }
  @Post(':id/view') @HttpCode(204) async view(@Param('id') id: string) {
    await this.videos.view(id);
  }
  @Get(':id/playback')
  @ApiOperation({
    description:
      'Public for approved videos. Send a Bearer access token for personal interaction status or owner access to unapproved videos.',
  })
  @UseGuards(OptionalAccessGuard)
  async playback(
    @Param('id') id: string,
    @Req() req: Partial<AuthenticatedRequest>,
  ) {
    return {
      code: 1000,
      result: await this.videos.playback(id, req.principal?.sub),
    };
  }
  @Get(':id')
  @ApiOperation({
    description:
      'Public for approved videos. Send a Bearer access token to access an unapproved video as its owner or a reviewer.',
  })
  @UseGuards(OptionalAccessGuard)
  async detail(
    @Param('id') id: string,
    @Req() req: Partial<AuthenticatedRequest>,
  ) {
    return {
      code: 1000,
      result: await this.videos.detail(
        id,
        req.principal?.sub,
        req.principal?.scope,
      ),
    };
  }
}

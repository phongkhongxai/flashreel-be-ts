import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { VideoStatus } from '@prisma/client';
import {
  AccessGuard,
  type AuthenticatedRequest,
} from '../auth/access.guard.js';
import { AuthError } from '../auth/auth-error.js';
import { VideosService } from './videos.service.js';
import { pagination } from './pagination.js';
enum RejectReason {
  COPYRIGHT = 'COPYRIGHT',
  INAPPROPRIATE_CONTENT = 'INAPPROPRIATE_CONTENT',
  LOW_QUALITY = 'LOW_QUALITY',
  SPAM = 'SPAM',
  OTHER = 'OTHER',
}
class RejectDto {
  @ApiPropertyOptional({ enum: RejectReason })
  @IsOptional()
  @IsEnum(RejectReason)
  reasonType?: RejectReason;
  @ApiPropertyOptional() @IsOptional() @IsString() customReason?: string;
}
@Injectable()
export class ReviewerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      !req.principal.scope
        ?.split(' ')
        .some((role) => role === 'ROLE_ADMIN' || role === 'ROLE_REVIEWER')
    )
      throw new AuthError(1007, 'You do not have permission', 403);
    return true;
  }
}
@Controller('admin/videos')
@ApiBearerAuth('access-token')
@UseGuards(AccessGuard, ReviewerGuard)
export class VideoAdminController {
  constructor(private readonly videos: VideosService) {}
  @Get() async list(
    @Query('status') status?: VideoStatus,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    if (status && !Object.values(VideoStatus).includes(status))
      throw new AuthError(1001, 'Uncategorized error', 400);
    const p = pagination(page, size);
    return {
      code: 1000,
      result: await this.videos.adminList(status, p.page, p.size),
    };
  }
  @Post(':id/approve') @HttpCode(200) async approve(@Param('id') id: string) {
    return { code: 1000, result: await this.videos.moderate(id, 'approve') };
  }
  @Post(':id/reject') @HttpCode(200) async reject(
    @Param('id') id: string,
    @Body() body: RejectDto,
  ) {
    const reason = body.customReason?.trim() || body.reasonType;
    if (!reason) throw new AuthError(2008, 'Reject reason is required', 400);
    return {
      code: 1000,
      result: await this.videos.moderate(id, 'reject', reason),
    };
  }
  @Post(':id/take-down') @HttpCode(200) async takeDown(
    @Param('id') id: string,
  ) {
    return { code: 1000, result: await this.videos.moderate(id, 'take-down') };
  }
}

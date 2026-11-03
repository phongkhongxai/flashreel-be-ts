import {
  Controller,
  Delete,
  Get,
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
import { FollowService } from './follow.service.js';
@Controller('users/:authorId/follow')
@ApiBearerAuth('access-token')
@UseGuards(AccessGuard)
export class FollowController {
  constructor(private readonly service: FollowService) {}
  @Get() async status(
    @Req() req: AuthenticatedRequest,
    @Param('authorId') id: string,
  ) {
    return { code: 1000, result: await this.service.status(req.principal, id) };
  }
  @Post() @HttpCode(200) follow(
    @Req() req: AuthenticatedRequest,
    @Param('authorId') id: string,
  ) {
    return this.service.change(req.principal, id, true);
  }
  @Delete() @HttpCode(200) unfollow(
    @Req() req: AuthenticatedRequest,
    @Param('authorId') id: string,
  ) {
    return this.service.change(req.principal, id, false);
  }
}

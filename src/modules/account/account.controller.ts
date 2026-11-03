import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import {
  AccessGuard,
  type AuthenticatedRequest,
} from '../auth/access.guard.js';
import { ConfirmDto } from './account.dto.js';
import { AccountService } from './account.service.js';
@Controller('account/cancellation')
@UseGuards(AccessGuard)
@ApiBearerAuth('access-token')
export class AccountController {
  constructor(private readonly service: AccountService) {}
  @Post('request') @HttpCode(200) request(@Req() req: AuthenticatedRequest) {
    return this.service.request(req.principal);
  }
  @Post('confirm') @HttpCode(200) confirm(
    @Req() req: AuthenticatedRequest,
    @Body() body: ConfirmDto,
  ) {
    return this.service.confirm(req.principal, body);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { AuthError } from '../auth/auth-error.js';
import {
  AccessGuard,
  type AuthenticatedRequest,
} from '../auth/access.guard.js';
import { RegistrationDto, UpdateUserDto, ProfileDto } from './users.dto.js';
import { UsersService } from './users.service.js';
import { AdminGuard } from '../auth/admin.guard.js';
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Post('registration') @HttpCode(200) async register(
    @Body() body: RegistrationDto,
  ) {
    return { code: 1000, result: await this.users.register(body) };
  }
  @ApiBearerAuth('access-token')
  @Get()
  @UseGuards(AccessGuard, AdminGuard)
  async list() {
    return { code: 1000, result: await this.users.list() };
  }
  @ApiBearerAuth('access-token')
  @Get('my-info')
  @UseGuards(AccessGuard)
  async me(@Req() req: AuthenticatedRequest) {
    return {
      code: 1000,
      result: await this.users.byUsername(req.principal.sub),
    };
  }
  @ApiBearerAuth('access-token')
  @Get('me/profile')
  @UseGuards(AccessGuard)
  async profile(@Req() req: AuthenticatedRequest) {
    return {
      code: 1000,
      result: await this.users.byUsername(req.principal.sub),
    };
  }
  @Put('me/profile')
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['nickname'],
      properties: {
        nickname: { type: 'string', maxLength: 100 },
        avatarUrl: { type: 'string' },
        avatarFile: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseGuards(AccessGuard)
  @UseInterceptors(FileInterceptor('avatarFile'))
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        transform: true,
        exceptionFactory: () =>
          new AuthError(
            1021,
            'Nickname must not be blank and must not exceed 100 characters',
            400,
          ),
      }),
    )
    body: ProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return {
      code: 1000,
      result: await this.users.updateProfile(req.principal.sub, body, file),
    };
  }
  @ApiBearerAuth('access-token')
  @Get(':userId')
  @UseGuards(AccessGuard)
  async get(@Param('userId') id: string) {
    return { code: 1000, result: await this.users.byId(id) };
  }
  @ApiBearerAuth('access-token')
  @Put(':userId')
  @UseGuards(AccessGuard)
  async update(@Param('userId') id: string, @Body() dto: UpdateUserDto) {
    return { code: 1000, result: await this.users.update(id, dto) };
  }
  @ApiBearerAuth('access-token')
  @Delete(':userId')
  @UseGuards(AccessGuard, AdminGuard)
  async delete(@Param('userId') id: string) {
    return { code: 1000, result: await this.users.delete(id) };
  }
}

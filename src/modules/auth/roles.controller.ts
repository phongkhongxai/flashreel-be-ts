import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { RolesService } from './roles.service.js';
import { AccessGuard } from './access.guard.js';

class RoleRequest {
  @ApiProperty({ example: 'USER' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

@Controller('roles')
@ApiBearerAuth('access-token')
@UseGuards(AccessGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Post()
  @HttpCode(200)
  async create(@Body() body: RoleRequest) {
    const result = await this.roles.create(body.name, body.description);
    return { code: 1000, result };
  }

  @Get()
  async list() {
    return { code: 1000, result: await this.roles.list() };
  }
}

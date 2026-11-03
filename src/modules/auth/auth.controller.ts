import { Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';

class LoginRequest {
  @ApiProperty({ example: 'johndoe' })
  @IsString()
  username!: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  password!: string;
}

class TokenRequest {
  @ApiProperty({ description: 'Access token to inspect' })
  @IsString()
  token!: string;
}

class RefreshRequest {
  @ApiProperty({ description: 'Refresh token to rotate' })
  @IsString()
  refreshToken!: string;
}

class LogoutRequest {
  @ApiPropertyOptional({ description: 'Access token to revoke' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ description: 'Refresh token to revoke' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

class EmailRequest {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(100)
  email!: string;
}

class ResetPasswordRequest extends EmailRequest {
  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 50 })
  @IsString()
  @Matches(/\S/)
  @Length(8, 50)
  newPassword!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginRequest) {
    return {
      code: 1000,
      result: await this.auth.login(body.username, body.password),
    };
  }

  @Post('outbound/authentication')
  @HttpCode(200)
  async outbound(
    @Query('code') code: string,
    @Query('codeVerifier') codeVerifier: string,
  ) {
    return { code: 1000, result: await this.auth.outbound(code, codeVerifier) };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: RefreshRequest) {
    return { code: 1000, result: await this.auth.refresh(body.refreshToken) };
  }

  @Post('introspect')
  @HttpCode(200)
  async introspect(@Body() body: TokenRequest) {
    return { code: 1000, result: await this.auth.introspect(body.token) };
  }

  @Post('verify-code')
  @HttpCode(200)
  async verifyEmail(
    @Query('email') email: string,
    @Query('code') code: string,
  ) {
    return this.auth.verifyEmail(email, code);
  }

  @Post('resend-code')
  @HttpCode(200)
  async resendCode(@Body() body: EmailRequest) {
    await this.auth.resendCode(body.email);
    return {
      code: 1000,
      message: 'If the account is eligible, a code will be sent.',
    };
  }

  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: EmailRequest) {
    await this.auth.forgotPassword(body.email);
    return {
      code: 1000,
      message: 'If the account is eligible, a code will be sent.',
    };
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: ResetPasswordRequest) {
    await this.auth.resetPassword(body.email, body.code, body.newPassword);
    return { code: 1000, message: 'Password reset successfully.' };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() body: LogoutRequest) {
    await this.auth.logout(body.accessToken, body.refreshToken);
    return { code: 1000 };
  }
}

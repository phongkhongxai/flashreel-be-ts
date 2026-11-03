import { HttpException } from '@nestjs/common';

export class AuthError extends HttpException {
  constructor(code: number, message: string, status: number) {
    super({ code, message }, status);
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthError } from '../../modules/auth/auth-error.js';
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof AuthError) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    if (exception instanceof HttpException && exception.getStatus() === 401) {
      response.status(401).json({ code: 1006, message: 'Unauthenticated' });
      return;
    }
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    if (!(exception instanceof HttpException))
      this.logger.error(
        'Unhandled request exception',
        exception instanceof Error ? exception.stack : String(exception),
      );
    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';
    const message =
      typeof body === 'string'
        ? body
        : ((body as { message?: string | string[] }).message ??
          'Request failed');
    response.status(status).json({ statusCode: status, message });
  }
}

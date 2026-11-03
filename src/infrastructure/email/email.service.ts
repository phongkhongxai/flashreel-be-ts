import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  constructor(private readonly config: ConfigService) {}

  async sendCode(
    email: string,
    otp: string,
    purpose: 'verification' | 'password-reset',
  ): Promise<void> {
    const host = this.config.getOrThrow<string>('MAIL_HOST');
    const port = Number(this.config.getOrThrow<string>('MAIL_PORT'));
    const user = this.config.getOrThrow<string>('MAIL_USERNAME');
    const pass = this.config.getOrThrow<string>('MAIL_PASSWORD');
    const from = this.config.getOrThrow<string>('MAIL_FROM');
    await nodemailer
      .createTransport({
        host,
        port,
        secure: port === 465,
        requireTLS: port === 587,
        auth: { user, pass },
      })
      .sendMail({
        from,
        to: email,
        subject:
          purpose === 'verification' ? 'Email Verification' : 'Password Reset',
        text: `Your ${purpose === 'verification' ? 'verification' : 'password reset'} code is ${otp}. It expires in 10 minutes.`,
      });
  }

  sendVerificationInBackground(email: string, otp: string): void {
    void this.sendCode(email, otp, 'verification').catch((error: unknown) => {
      this.logger.error(
        'Cannot send verification email',
        error instanceof Error ? error.message : String(error),
      );
    });
  }

  sendPasswordResetInBackground(email: string, otp: string): void {
    void this.sendCode(email, otp, 'password-reset').catch((error: unknown) => {
      this.logger.error(
        'Cannot send password reset email',
        error instanceof Error ? error.message : String(error),
      );
    });
  }
}

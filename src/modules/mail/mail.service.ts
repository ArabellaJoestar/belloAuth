import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EnvConfig } from '../../config/env.validation.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    const user = this.configService.get('SMTP_USER');
    const pass = this.configService.get('SMTP_PASS');

    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST'),
      port: this.configService.get('SMTP_PORT'),
      secure: false,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async sendTwoFactorCode(email: string, code: string): Promise<void> {
    const from = this.configService.get('SMTP_FROM');
    await this.transporter.sendMail({
      from,
      to: email,
      subject: 'Seu codigo de verificacao 2FA - OAuth Provider',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="margin-top: 0; color: #111827;">Verificacao em Duas Etapas (2FA)</h2>
          <p style="color: #4b5563;">Utilize o codigo abaixo para concluir sua autenticacao. Ele expira em 5 minutos.</p>
          <div style="background: #f3f4f6; padding: 16px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; border-radius: 6px; color: #1f2937;">
            ${code}
          </div>
        </div>
      `,
    });
    this.logger.log(`Codigo 2FA enviado para ${email}`);
  }

  async sendMagicLink(email: string, token: string, queryString: string): Promise<void> {
    const from = this.configService.get('SMTP_FROM');
    const frontendUrl = this.configService.get('PROVIDER_FRONTEND_URL');
    const separator = queryString ? `&${queryString}` : '';
    const link = `${frontendUrl}/?magic_token=${encodeURIComponent(token)}${separator}`;

    await this.transporter.sendMail({
      from,
      to: email,
      subject: 'Seu link de acesso rapido (Magic Link) - OAuth Provider',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="margin-top: 0; color: #111827;">Acesso sem Senha</h2>
          <p style="color: #4b5563;">Clique no botao abaixo para autenticar sua sessao instantaneamente. Este link e de uso unico e expira em 10 minutos.</p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${link}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">
              Autenticar Agora
            </a>
          </p>
          <p style="font-size: 12px; color: #6b7280; word-break: break-all;">Ou copie a URL: ${link}</p>
        </div>
      `,
    });
    this.logger.log(`Magic Link enviado para ${email}`);
  }
}
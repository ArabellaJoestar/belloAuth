import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { OAuthService } from './oauth.service.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  loginInitSchema,
  verifyTwoFactorSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
  tokenExchangeSchema,
  externalTokenRequestSchema,
  updateClientWebhookSchema,
  type LoginInitDto,
  type VerifyTwoFactorDto,
  type MagicLinkRequestDto,
  type MagicLinkVerifyDto,
  type TokenExchangeDto,
  type ExternalTokenRequestDto,
  type UpdateClientWebhookDto,
} from './dto/oauth.schemas.js';
import { OAuthJwtGuard, type JwtTokenPayload } from './guards/oauth-jwt.guard.js';

@Controller('oauth')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  private extractClientMetadata(req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const ipAddress =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : req.socket.remoteAddress ?? null;
    const userAgent = req.headers['user-agent'] ?? null;
    return { ipAddress, userAgent };
  }

  @Get('clients')
  async getClients() {
    return this.oauthService.listClients();
  }

  @Patch('clients/webhook')
  async updateWebhook(
    @Body(new ZodValidationPipe(updateClientWebhookSchema)) dto: UpdateClientWebhookDto,
  ) {
    return this.oauthService.updateClientWebhook(dto);
  }

  @Post('authorize/login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginInitSchema)) dto: LoginInitDto,
    @Req() req: Request,
  ) {
    const { ipAddress, userAgent } = this.extractClientMetadata(req);
    return this.oauthService.initiateLogin(dto, ipAddress, userAgent);
  }

  @Post('authorize/verify-2fa')
  @HttpCode(HttpStatus.OK)
  async verify2FA(
    @Body(new ZodValidationPipe(verifyTwoFactorSchema)) dto: VerifyTwoFactorDto,
  ) {
    return this.oauthService.verifyTwoFactor(dto);
  }

  @Post('authorize/magic-link')
  @HttpCode(HttpStatus.OK)
  async sendMagicLink(
    @Body(new ZodValidationPipe(magicLinkRequestSchema)) dto: MagicLinkRequestDto,
    @Req() req: Request,
  ) {
    const { ipAddress, userAgent } = this.extractClientMetadata(req);
    return this.oauthService.requestMagicLink(dto, ipAddress, userAgent);
  }

  @Post('authorize/magic-link/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMagicLink(
    @Body(new ZodValidationPipe(magicLinkVerifySchema)) dto: MagicLinkVerifyDto,
  ) {
    return this.oauthService.verifyMagicLink(dto);
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  async token(
    @Body(new ZodValidationPipe(tokenExchangeSchema)) dto: TokenExchangeDto,
    @Req() req: Request,
  ) {
    const { ipAddress, userAgent } = this.extractClientMetadata(req);
    return this.oauthService.exchangeToken(dto, ipAddress, userAgent);
  }

  @Post('external/acquire')
  @HttpCode(HttpStatus.OK)
  async acquireExternal(
    @Body(new ZodValidationPipe(externalTokenRequestSchema)) dto: ExternalTokenRequestDto,
    @Req() req: Request,
  ) {
    const { ipAddress, userAgent } = this.extractClientMetadata(req);
    return this.oauthService.acquireExternalProviderToken(dto, ipAddress, userAgent);
  }

  @Get('userinfo')
  @UseGuards(OAuthJwtGuard)
  async userInfo(@Req() req: Request & { user?: JwtTokenPayload }) {
    return {
      authenticated: true,
      tokenPayload: req.user,
      serverTimestamp: new Date().toISOString(),
    };
  }
}
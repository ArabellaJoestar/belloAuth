import { Controller, Get, Post, Body, Headers, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { WebhooksService, type WebhookExpirationPayload } from './webhooks.service.js';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('receiver')
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Body() payload: WebhookExpirationPayload,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    this.logger.log(
      `Webhook recebido na rota configuravel! JTI: ${payload.jti} | Contexto: ${payload.tokenContext}`,
    );
    await this.webhooksService.recordLocalInboxAlert(payload);
    return { received: true, signatureVerified: Boolean(signature) };
  }

  @Get('alerts')
  async listRecentAlerts() {
    const alerts = await this.webhooksService.getLocalInboxAlerts();
    return { count: alerts.length, alerts };
  }

  @Post('trigger-scan')
  @HttpCode(HttpStatus.OK)
  async forceScan() {
    await this.webhooksService.scanExpiringTokens();
    return { scanned: true };
  }
}
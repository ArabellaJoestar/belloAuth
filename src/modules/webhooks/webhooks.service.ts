import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { SessionsService } from '../sessions/sessions.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { EnvConfig } from '../../config/env.validation.js';

export interface WebhookExpirationPayload {
  event: 'token.expiring_soon';
  jti: string;
  clientId: string;
  userId: string | null;
  tokenContext: 'ISSUED_BY_US' | 'ACQUIRED_EXTERNAL';
  grantType: string;
  expiresAt: string;
  remainingSeconds: number;
  geolocation: {
    latitude: number | null;
    longitude: number | null;
  };
  timestamp: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private isScanning = false;

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async scanExpiringTokens(): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      const threshold = this.configService.get('WEBHOOK_EXPIRATION_THRESHOLD_SECONDS');
      const candidates = await this.sessionsService.findExpiringSessions(threshold);

      for (const session of candidates) {
        const remainingSeconds = Math.max(
          0,
          Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
        );

        if (remainingSeconds <= 0) {
          await this.sessionsService.markWebhookNotified(session.id);
          continue;
        }

        const payload: WebhookExpirationPayload = {
          event: 'token.expiring_soon',
          jti: session.jti,
          clientId: session.clientId,
          userId: session.userId,
          tokenContext: session.tokenContext,
          grantType: session.grantType,
          expiresAt: session.expiresAt.toISOString(),
          remainingSeconds,
          geolocation: {
            latitude: session.latitude ? Number(session.latitude) : null,
            longitude: session.longitude ? Number(session.longitude) : null,
          },
          timestamp: new Date().toISOString(),
        };

        await this.recordLocalInboxAlert(payload);

        if (session.webhookTargetUrl) {
          const delivered = await this.dispatchWithExponentialBackoff(
            session.webhookTargetUrl,
            payload,
          );
          if (delivered) {
            await this.sessionsService.markWebhookNotified(session.id);
          }
        } else {
          await this.sessionsService.markWebhookNotified(session.id);
        }
      }
    } catch (err) {
      this.logger.error('Erro durante varredura do Cron de Webhooks:', err);
    } finally {
      this.isScanning = false;
    }
  }

  async dispatchWithExponentialBackoff(
    targetUrl: string,
    payload: WebhookExpirationPayload,
    maxRetries = 3,
  ): Promise<boolean> {
    const body = JSON.stringify(payload);
    const secret = this.configService.get('JWT_SECRET');
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': payload.event,
            'X-Webhook-Signature': `sha256=${signature}`,
          },
          body,
          signal: AbortSignal.timeout(3500),
        });

        if (response.ok) {
          this.logger.log(
            `Webhook entregue com sucesso para ${targetUrl} (jti: ${payload.jti})`,
          );
          return true;
        }

        this.logger.warn(
          `Tentativa ${attempt}/${maxRetries} falhou para ${targetUrl} com status ${response.status}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        this.logger.warn(
          `Tentativa ${attempt}/${maxRetries} erro de rede para ${targetUrl}: ${message}`,
        );
      }

      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 500;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    return false;
  }

  async recordLocalInboxAlert(payload: WebhookExpirationPayload): Promise<void> {
    const existing =
      (await this.redisService.getJson<WebhookExpirationPayload[]>('webhook:inbox:alerts')) ?? [];
    const updated = [payload, ...existing.filter((item) => item.jti !== payload.jti)].slice(0, 30);
    await this.redisService.setJson('webhook:inbox:alerts', updated, 3600);
  }

  async getLocalInboxAlerts(): Promise<WebhookExpirationPayload[]> {
    return (await this.redisService.getJson<WebhookExpirationPayload[]>('webhook:inbox:alerts')) ?? [];
  }
}
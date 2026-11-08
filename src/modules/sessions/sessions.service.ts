import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThanOrEqual, MoreThan } from 'typeorm';
import { SessionAudit, TokenContextType } from './entities/session-audit.entity.js';
import { RedisService } from '../../redis/redis.service.js';

export interface CreateSessionInput {
  jti: string;
  userId?: string | null;
  clientId: string;
  tokenContext: TokenContextType;
  grantType: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  webhookTargetUrl?: string | null;
  ttlSeconds: number;
}

export interface ActiveSessionCache {
  jti: string;
  userId: string | null;
  clientId: string;
  tokenContext: TokenContextType;
  grantType: string;
  ipAddress: string | null;
  userAgent: string | null;
  latitude: number | null;
  longitude: number | null;
  issuedAt: string;
  expiresAt: string;
}

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(SessionAudit)
    private readonly auditRepo: Repository<SessionAudit>,
    private readonly redisService: RedisService,
  ) {}

  async registerSession(input: CreateSessionInput): Promise<SessionAudit> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.ttlSeconds * 1000);

    const cachePayload: ActiveSessionCache = {
      jti: input.jti,
      userId: input.userId ?? null,
      clientId: input.clientId,
      tokenContext: input.tokenContext,
      grantType: input.grantType,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await this.redisService.setJson(`session:jti:${input.jti}`, cachePayload, input.ttlSeconds);

    const audit = this.auditRepo.create({
      jti: input.jti,
      userId: input.userId ?? null,
      clientId: input.clientId,
      tokenContext: input.tokenContext,
      grantType: input.grantType,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      webhookTargetUrl: input.webhookTargetUrl ?? null,
      expiresAt,
      webhookNotified: false,
      revokedAt: null,
    });

    return this.auditRepo.save(audit);
  }

  async revokeSessionByJti(jti: string): Promise<void> {
    const audit = await this.auditRepo.findOne({ where: { jti } });
    if (!audit) {
      throw new NotFoundException('Sessao nao encontrada.');
    }

    const remainingMs = audit.expiresAt.getTime() - Date.now();
    const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

    await this.redisService.blacklistJwt(jti, remainingSeconds);
    await this.redisService.del(`session:jti:${jti}`);

    audit.revokedAt = new Date();
    await this.auditRepo.save(audit);
  }

  async findExpiringSessions(thresholdSeconds: number): Promise<SessionAudit[]> {
    const now = new Date();
    const thresholdDate = new Date(now.getTime() + thresholdSeconds * 1000);

    return this.auditRepo.find({
      where: {
        revokedAt: IsNull(),
        webhookNotified: false,
        expiresAt: LessThanOrEqual(thresholdDate),
      },
      order: { expiresAt: 'ASC' },
      take: 100,
    });
  }

  async markWebhookNotified(id: string): Promise<void> {
    await this.auditRepo.update({ id }, { webhookNotified: true });
  }

  async listRecentSessions(limit = 30): Promise<SessionAudit[]> {
    return this.auditRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async listActiveSessions(): Promise<SessionAudit[]> {
    return this.auditRepo.find({
      where: {
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { expiresAt: 'ASC' },
    });
  }
}
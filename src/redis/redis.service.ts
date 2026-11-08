import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { EnvConfig } from '../config/env.validation.js';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.configService.get('REDIS_HOST'),
      port: this.configService.get('REDIS_PORT'),
      password: this.configService.get('REDIS_PASSWORD') || undefined,
      lazyConnect: false,
    });

    this.client.on('connect', () => this.logger.log('Conectado ao Redis com sucesso.'));
    this.client.on('error', (err) => this.logger.error('Erro na conexão com o Redis:', err));
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async setString(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async getString(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async blacklistJwt(jti: string, remainingTtlSeconds: number): Promise<void> {
    if (remainingTtlSeconds > 0) {
      await this.client.set(`blacklist:jti:${jti}`, 'revoked', 'EX', remainingTtlSeconds);
    }
  }

  async isJwtBlacklisted(jti: string): Promise<boolean> {
    const result = await this.client.exists(`blacklist:jti:${jti}`);
    return result === 1;
  }
}
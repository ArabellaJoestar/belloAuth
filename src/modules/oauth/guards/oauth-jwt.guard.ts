import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { RedisService } from '../../../redis/redis.service.js';

export interface JwtTokenPayload {
  sub: string;
  jti: string;
  client_id: string;
  grant_type: string;
  iat: number;
  exp: number;
}

@Injectable()
export class OAuthJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtTokenPayload }>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token ausente.');
    }

    const token = authHeader.slice(7).trim();

    try {
      const payload = await this.jwtService.verifyAsync<JwtTokenPayload>(token);

      const isBlacklisted = await this.redisService.isJwtBlacklisted(payload.jti);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token revogado na blacklist.');
      }

      request.user = payload;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token JWT invalido ou expirado.');
    }
  }
}
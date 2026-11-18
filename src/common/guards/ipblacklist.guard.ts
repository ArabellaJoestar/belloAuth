import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service.js';

@Injectable()
export class IpBlacklistGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    const clientIp = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
    
    if (!clientIp) {
      return true;
    }

    const isBlacklisted = await this.redisService.getString(`blacklist:ip:${clientIp}`);

    if (isBlacklisted) {
      throw new ForbiddenException('Acesso negado.');
    }

    return true;
  }
}
import { Controller, Get, Post, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { SessionsService } from './sessions.service.js';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  async listAll() {
    const sessions = await this.sessionsService.listRecentSessions(50);
    return { count: sessions.length, sessions };
  }

  @Get('active')
  async listActive() {
    const sessions = await this.sessionsService.listActiveSessions();
    return { count: sessions.length, sessions };
  }

  @Post(':jti/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(@Param('jti') jti: string) {
    await this.sessionsService.revokeSessionByJti(jti);
    return { revoked: true, jti };
  }
}
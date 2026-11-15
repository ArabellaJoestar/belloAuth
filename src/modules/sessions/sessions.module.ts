import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionAudit } from './entities/session-audit.entity.js';
import { SessionsService } from './sessions.service.js';
import { SessionsController } from './sessions.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([SessionAudit])],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
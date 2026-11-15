import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuthClient } from './entities/oauth-client.entity.js';
import { OAuthService } from './oauth.service.js';
import { OAuthController } from './oauth.controller.js';
import { OAuthJwtGuard } from './guards/oauth-jwt.guard.js';
import { UsersModule } from '../users/users.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { MailModule } from '../mail/mail.module.js';
import { EnvConfig } from '../../config/env.validation.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([OAuthClient]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: {
          issuer: 'oauth-ecosystem-provider',
        },
      }),
    }),
    UsersModule,
    SessionsModule,
    MailModule,
  ],
  controllers: [OAuthController],
  providers: [OAuthService, OAuthJwtGuard],
  exports: [OAuthService, OAuthJwtGuard, JwtModule],
})
export class OAuthModule {}
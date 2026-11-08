import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../config/env.validation.js';
import { User } from '../modules/users/entities/user.entity.js';
import { OAuthClient } from '../modules/oauth/entities/oauth-client.entity.js';
import { SessionAudit } from '../modules/sessions/entities/session-audit.entity.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>): TypeOrmModuleOptions => {
        const dbType = config.get('DB_TYPE');
        const commonOptions = {
          entities: [User, OAuthClient, SessionAudit],
          synchronize: config.get('DB_SYNCHRONIZE'),
        }
        return {
          ...commonOptions,
          type: dbType,
          host: config.get('DB_HOST'),
          port: config.get('DB_PORT'),
          username: config.get('DB_USERNAME'),
          password: config.get('DB_PASSWORD'),
          database: config.get('DB_DATABASE'),
        } as TypeOrmModuleOptions;
      },
    }),
  ],
})
export class DatabaseModule {}
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/env.validation.js';
import { DatabaseModule } from './database/database.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
  ],
})
export class AppModule {}
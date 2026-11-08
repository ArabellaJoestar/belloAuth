import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { EnvConfig } from './config/env.validation.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const configService = app.get(ConfigService<EnvConfig, true>);
  const port = configService.get('PORT');

  await app.listen(port);
  logger.log(`OAuth Backend rodando em http://localhost:${port}`);
}
bootstrap();
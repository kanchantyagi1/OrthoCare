import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();
  // No global prefix: the mobile app and docs/API.md both consume bare paths
  // (e.g. POST /auth/login, not POST /api/auth/login) per spec section 54.

  const config = app.get(ConfigService);
  const port = config.get<number>('port') || 3000;

  await app.listen(port);
  Logger.log(`Prime Ortho backend listening on port ${port}`, 'Bootstrap');

  if (config.get('openai.mockMode')) {
    Logger.warn('Clinic assistant running in MOCK MODE - set OPENAI_API_KEY for real answers/embeddings', 'Bootstrap');
  }
  if (config.get('fcm.mockMode')) {
    Logger.warn('FCM running in MOCK MODE - push notifications are logged only, not sent', 'Bootstrap');
  }
}

bootstrap();

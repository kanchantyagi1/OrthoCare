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
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);
  const port = config.get<number>('port') || 3000;

  await app.listen(port);
  Logger.log(`OrthoCare AI backend listening on port ${port}`, 'Bootstrap');

  if (config.get('openai.mockMode')) {
    Logger.warn('OPENAI running in MOCK MODE - set OPENAI_API_KEY for real GPT-4.1-mini/embeddings', 'Bootstrap');
  }
  if (config.get('fcm.mockMode')) {
    Logger.warn('FCM running in MOCK MODE - push notifications are logged only, not sent', 'Bootstrap');
  }
}

bootstrap();

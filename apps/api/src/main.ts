import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  configureApp(app, env);
  app.enableShutdownHooks();

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ARC LABS LMS API')
      .setVersion('v1')
      .addBearerAuth()
      .addGlobalParameters({ name: 'X-Org-Id', in: 'header', required: false })
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config));
  }

  await app.listen(env.PORT);
  Logger.log(`API ready on http://localhost:${env.PORT}/api/v1  (docs: /api/docs)`, 'Bootstrap');
}

void bootstrap();

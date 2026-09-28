import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { requestId } from './common/request-id.middleware';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  app.use(requestId);
  app.use(helmet());
  app.enableCors({ origin: env.WEB_ORIGIN.split(','), credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
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

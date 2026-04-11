import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
  
  const corsOptions = {
    origin: ["http://localhost:3000","https://launchkit-frontend-wheat.vercel.app"],
    credentials: true,
  };
  console.log('CORS enabled with origins:', corsOptions.origin);
  
  app.enableCors(corsOptions);
  await app.listen(process.env.PORT ?? 3001);
  console.log('Server running on port:', process.env.PORT ?? 3001);
}
void bootstrap();

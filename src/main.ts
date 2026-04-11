import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(
    '/webhooks/stripe',
    bodyParser.raw({ type: 'application/json' }),
  );
  app.enableCors({
    origin: ["http://localhost:3000","https://launchkit-frontend-wheat.vercel.app"],
    credentials: true,
  });
  console.log('CORS enabled for:', ["http://localhost:3000","https://launchkit-frontend-wheat.vercel.app"]);
  await app.listen(process.env.PORT ?? 3001);
  console.log('Server running on port:', process.env.PORT ?? 3001);
}
void bootstrap();

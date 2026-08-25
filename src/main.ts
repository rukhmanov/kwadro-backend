import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:4200',
      'https://rukhmanov-kwadro-frontend-877a.twc1.net',
      'https://rukhmanov-kwadro-frontend-a087.twc1.net',
      'https://motomarket52r.ru',
      'https://motomarket52.ru',
    ],
    credentials: true,
  });
  // 0.0.0.0 — иначе Caddy на Timeweb не достучится до Nest (пустой 200 без CORS)
  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();

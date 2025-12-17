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
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

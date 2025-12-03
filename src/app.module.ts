import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { User } from './entities/user.entity';
import { News } from './entities/news.entity';
import { CartItem } from './entities/cart-item.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatSession } from './entities/chat-session.entity';
import { ContactRequest } from './entities/contact-request.entity';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { AuthModule } from './auth/auth.module';
import { NewsModule } from './news/news.module';
import { CartModule } from './cart/cart.module';
import { ChatModule } from './chat/chat.module';
import { ContactModule } from './contact/contact.module';
import { TelegramModule } from './telegram/telegram.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: process.env.DB_USER || 'aleksrukhmanov',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kwadro_shop',
      entities: [Category, Product, User, News, CartItem, ChatMessage, ChatSession, ContactRequest],
      synchronize: true,
    }),
    CategoriesModule,
    ProductsModule,
    AuthModule,
    NewsModule,
    CartModule,
    ChatModule,
    ContactModule,
    TelegramModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  constructor(private appService: AppService) {}
}

import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramParserService } from './telegram-parser.service';
import { ProductsModule } from '../products/products.module';
import { NewsModule } from '../news/news.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [ProductsModule, NewsModule, CategoriesModule],
  providers: [TelegramService, TelegramParserService],
  exports: [TelegramService],
})
export class TelegramModule {}


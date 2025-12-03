import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartItem } from '../entities/cart-item.entity';
import { Product } from '../entities/product.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CartItem, Product]),
    StorageModule,
  ],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}


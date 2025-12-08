import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { Product } from '../entities/product.entity';
import { Category } from '../entities/category.entity';
import { CartItem } from '../entities/cart-item.entity';
import { ProductSpecification } from '../entities/product-specification.entity';
import { CategorySpecification } from '../entities/category-specification.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Category, CartItem, ProductSpecification, CategorySpecification]), StorageModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}


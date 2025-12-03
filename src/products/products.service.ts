import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { CartItem } from '../entities/cart-item.entity';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(CartItem)
    private cartItemsRepository: Repository<CartItem>,
    private storageService: StorageService,
  ) {}

  private async transformProduct(product: Product): Promise<Product> {
    if (!product) return product;
    
    if (product.image) {
      const url = await this.storageService.getFileUrl(product.image);
      if (url) {
        product.image = url;
      }
    }
    
    if (product.images && product.images.length > 0) {
      const urls = await Promise.all(
        product.images.map(img => this.storageService.getFileUrl(img))
      );
      product.images = urls.filter((url): url is string => url !== null);
    }
    
    if (product.video) {
      const url = await this.storageService.getFileUrl(product.video);
      if (url) {
        product.video = url;
      }
    }
    
    return product;
  }

  async findAll(): Promise<Product[]> {
    const products = await this.productsRepository.find({ 
      where: { isActive: true },
      relations: ['category'],
      order: { createdAt: 'DESC' },
    });
    return Promise.all(products.map(p => this.transformProduct(p)));
  }

  async findByCategory(categoryId: number): Promise<Product[]> {
    const products = await this.productsRepository.find({ 
      where: { categoryId, isActive: true },
      relations: ['category'],
      order: { createdAt: 'DESC' },
    });
    return Promise.all(products.map(p => this.transformProduct(p)));
  }

  async findOne(id: number): Promise<Product | null> {
    const product = await this.productsRepository.findOne({ 
      where: { id },
      relations: ['category'],
    });
    return product ? await this.transformProduct(product) : null;
  }

  async create(product: Partial<Product>): Promise<Product> {
    const newProduct = this.productsRepository.create(product);
    const saved = await this.productsRepository.save(newProduct);
    return await this.transformProduct(saved);
  }

  private extractKeyFromUrl(url: string): string | null {
    if (!url) return null;
    // Если это уже ключ (не начинается с http), возвращаем как есть
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return url;
    }
    // Извлекаем ключ из URL: https://s3.twcstorage.ru/bucket/folder/file.ext -> folder/file.ext
    const parts = url.split('/');
    const bucketIndex = parts.findIndex(part => part.includes('parsifal-files') || part.includes('twcstorage'));
    if (bucketIndex >= 0 && bucketIndex < parts.length - 1) {
      return parts.slice(bucketIndex + 1).join('/');
    }
    // Fallback: берем последние 2 части
    return parts.slice(-2).join('/');
  }

  async update(id: number, product: Partial<Product>): Promise<Product | null> {
    // Получаем существующий продукт напрямую из БД (без преобразования URL)
    const existingProduct = await this.productsRepository.findOne({ where: { id } });
    if (!existingProduct) return null;

    // Удаляем старые изображения, если они были заменены
    if (product.image && existingProduct.image) {
      const newKey = this.extractKeyFromUrl(product.image);
      const oldKey = this.extractKeyFromUrl(existingProduct.image);
      if (newKey && oldKey && newKey !== oldKey) {
        await this.storageService.deleteFile(oldKey);
      }
      // Сохраняем ключ, а не URL
      if (newKey) {
        product.image = newKey;
      }
    }

    if (product.images && existingProduct.images && existingProduct.images.length > 0) {
      const newKeys = product.images
        .map(img => this.extractKeyFromUrl(img))
        .filter((key): key is string => key !== null);
      const oldKeys = existingProduct.images
        .map(img => this.extractKeyFromUrl(img))
        .filter((key): key is string => key !== null && !newKeys.includes(key));
      if (oldKeys.length > 0) {
        await this.storageService.deleteFiles(oldKeys);
      }
      // Сохраняем ключи, а не URL
      product.images = newKeys;
    } else if (product.images) {
      // Если переданы новые изображения, преобразуем их в ключи
      product.images = product.images
        .map(img => this.extractKeyFromUrl(img))
        .filter((key): key is string => key !== null);
    }

    // Удаляем старое видео, если оно было заменено
    if (product.video && existingProduct.video) {
      const newKey = this.extractKeyFromUrl(product.video);
      const oldKey = this.extractKeyFromUrl(existingProduct.video);
      if (newKey && oldKey && newKey !== oldKey) {
        await this.storageService.deleteFile(oldKey);
      }
      if (newKey) {
        product.video = newKey;
      }
    }

    await this.productsRepository.update(id, product);
    return await this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    // Получаем продукт напрямую из БД (без преобразования URL)
    const product = await this.productsRepository.findOne({ where: { id } });
    if (product) {
      try {
        // Сначала удаляем все записи из корзины, связанные с этим товаром
        try {
          await this.cartItemsRepository.delete({ productId: id });
        } catch (error) {
          console.error('Ошибка при удалении записей корзины:', error);
          // Продолжаем удаление товара даже если записи корзины не удалось удалить
        }

        // Удаляем изображения из S3 (в БД хранятся ключи)
        if (product.image) {
          const imageKey = this.extractKeyFromUrl(product.image);
          if (imageKey) {
            try {
              await this.storageService.deleteFile(imageKey);
            } catch (error) {
              console.error('Ошибка при удалении главного изображения:', error);
              // Продолжаем удаление товара даже если файл не удалось удалить
            }
          }
        }
        if (product.images && product.images.length > 0) {
          const imageKeys = product.images
            .map(img => this.extractKeyFromUrl(img))
            .filter((key): key is string => key !== null);
          if (imageKeys.length > 0) {
            try {
              await this.storageService.deleteFiles(imageKeys);
            } catch (error) {
              console.error('Ошибка при удалении дополнительных изображений:', error);
              // Продолжаем удаление товара даже если файлы не удалось удалить
            }
          }
        }
        // Удаляем видео из S3
        if (product.video) {
          const videoKey = this.extractKeyFromUrl(product.video);
          if (videoKey) {
            try {
              await this.storageService.deleteFile(videoKey);
            } catch (error) {
              console.error('Ошибка при удалении видео:', error);
              // Продолжаем удаление товара даже если файл не удалось удалить
            }
          }
        }
      } catch (error) {
        console.error('Ошибка при удалении файлов товара:', error);
        // Продолжаем удаление товара из БД даже если файлы не удалось удалить
      }
    }
    await this.productsRepository.delete(id);
  }
}


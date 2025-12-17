import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product } from '../entities/product.entity';
import { Category } from '../entities/category.entity';
import { CartItem } from '../entities/cart-item.entity';
import { ProductSpecification } from '../entities/product-specification.entity';
import { CategorySpecification } from '../entities/category-specification.entity';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    @InjectRepository(CartItem)
    private cartItemsRepository: Repository<CartItem>,
    @InjectRepository(ProductSpecification)
    private productSpecsRepository: Repository<ProductSpecification>,
    @InjectRepository(CategorySpecification)
    private categorySpecsRepository: Repository<CategorySpecification>,
    private storageService: StorageService,
  ) {}

  private async transformProduct(product: Product): Promise<Product> {
    if (!product) return product;
    
    // Обрабатываем изображения
    if (product.images && product.images.length > 0) {
      // Если есть массив images, преобразуем их в URL
      const urls = await Promise.all(
        product.images.map(img => this.storageService.getFileUrl(img))
      );
      product.images = urls.filter((url): url is string => url !== null);
      
      // Для обратной совместимости устанавливаем первое изображение как image
      if (product.images.length > 0) {
        product.image = product.images[0];
      }
    } else if (product.image) {
      // Если массив images пустой, но есть старое поле image, преобразуем его и добавляем в массив
      const imageUrl = await this.storageService.getFileUrl(product.image);
      if (imageUrl) {
        product.image = imageUrl;
        product.images = [imageUrl]; // Добавляем в массив для единообразия
      } else {
        // Если не удалось получить URL, очищаем поле
        product.image = null;
        product.images = [];
      }
    } else {
      // Если нет ни images, ни image, убеждаемся что массив пустой
      product.images = [];
    }
    
    if (product.video) {
      const url = await this.storageService.getFileUrl(product.video);
      if (url) {
        product.video = url;
      }
    }
    
    return product;
  }

  async findAll(): Promise<Product[]>;
  async findAll(filters: {
    categoryId?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    isFeatured?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ products: Product[]; total: number; page: number; limit: number; totalPages: number }>;
  async findAll(filters?: {
    categoryId?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    isFeatured?: boolean;
    page?: number;
    limit?: number;
  }): Promise<Product[] | { products: Product[]; total: number; page: number; limit: number; totalPages: number }> {
    // Если фильтры не переданы, возвращаем простой массив
    if (!filters) {
      const products = await this.productsRepository.find({ 
        where: { isActive: true },
        relations: ['categories', 'specifications'],
        order: { createdAt: 'DESC' },
      });
      return Promise.all(products.map(p => this.transformProduct(p)));
    }
    const queryBuilder = this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.categories', 'categories')
      .leftJoinAndSelect('product.specifications', 'specifications')
      .where('product.isActive = :isActive', { isActive: true });

    // Фильтр по категории
    if (filters?.categoryId) {
      queryBuilder.andWhere('categories.id = :categoryId', { categoryId: filters.categoryId });
    }

    // Поиск по названию и описанию (регистронезависимый)
    if (filters?.search) {
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR product.description ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    // Фильтр по цене
    if (filters?.minPrice !== undefined) {
      queryBuilder.andWhere('product.price >= :minPrice', { minPrice: filters.minPrice });
    }
    if (filters?.maxPrice !== undefined) {
      queryBuilder.andWhere('product.price <= :maxPrice', { maxPrice: filters.maxPrice });
    }

    // Фильтр по наличию
    if (filters?.inStock !== undefined) {
      if (filters.inStock) {
        queryBuilder.andWhere('product.stock > 0');
      } else {
        queryBuilder.andWhere('product.stock = 0');
      }
    }

    // Фильтр по популярности
    if (filters?.isFeatured !== undefined) {
      queryBuilder.andWhere('product.isFeatured = :isFeatured', { isFeatured: filters.isFeatured });
    }

    // Сортировка
    const sortBy = filters?.sortBy || 'createdAt';
    const sortOrder = filters?.sortOrder || 'DESC';
    const validSortFields = ['name', 'price', 'createdAt', 'stock'];
    const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    queryBuilder.orderBy(`product.${finalSortBy}`, sortOrder);

    // Подсчет общего количества
    const total = await queryBuilder.getCount();

    // Пагинация
    const page = filters?.page || 1;
    const limit = filters?.limit || 15;
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const products = await queryBuilder.getMany();
    const transformedProducts = await Promise.all(products.map(p => this.transformProduct(p)));

    const totalPages = Math.ceil(total / limit);

    return {
      products: transformedProducts,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findByCategory(categoryId: number): Promise<Product[]> {
    const products = await this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.categories', 'categories')
      .leftJoinAndSelect('product.specifications', 'specifications')
      .where('product.isActive = :isActive', { isActive: true })
      .andWhere('categories.id = :categoryId', { categoryId })
      .orderBy('product.createdAt', 'DESC')
      .getMany();
    return Promise.all(products.map(p => this.transformProduct(p)));
  }

  async findOne(id: number): Promise<Product | null> {
    const product = await this.productsRepository.findOne({ 
      where: { id },
      relations: ['categories', 'specifications'],
    });
    return product ? await this.transformProduct(product) : null;
  }

  async getCategorySpecifications(categoryId: number): Promise<string[]> {
    const specs = await this.categorySpecsRepository.find({
      where: { categoryId },
      select: ['name'],
    });
    // Возвращаем уникальные названия характеристик
    return [...new Set(specs.map(s => s.name))];
  }

  async create(product: Partial<Product> & { categoryIds?: number[] }): Promise<Product> {
    const { specifications, categoryIds, ...productData } = product;
    const newProduct = this.productsRepository.create(productData);
    
    // Загружаем категории если указаны
    if (categoryIds && Array.isArray(categoryIds) && categoryIds.length > 0) {
      const categories = await this.categoriesRepository.find({
        where: { id: In(categoryIds) }
      });
      newProduct.categories = categories;
    }
    
    const saved = await this.productsRepository.save(newProduct);

    // Сохраняем характеристики товара
    if (specifications && Array.isArray(specifications) && specifications.length > 0) {
      const specsToSave = specifications.map((spec: { name: string; value: string }) => {
        const productSpec = this.productSpecsRepository.create({
          productId: saved.id,
          name: spec.name,
          value: spec.value,
        });
        return productSpec;
      });
      await this.productSpecsRepository.save(specsToSave);

      // Сохраняем названия характеристик для всех категорий товара (если их еще нет)
      if (saved.categories && saved.categories.length > 0) {
        for (const category of saved.categories) {
          const existingCategorySpecs = await this.categorySpecsRepository.find({
            where: { categoryId: category.id },
          });
          const existingNames = new Set(existingCategorySpecs.map(s => s.name));

          const newCategorySpecs = specifications
            .map((spec: { name: string; value: string }) => spec.name)
            .filter((name: string) => !existingNames.has(name))
            .map((name: string) => {
              return this.categorySpecsRepository.create({
                categoryId: category.id,
                name: name,
              });
            });

          if (newCategorySpecs.length > 0) {
            await this.categorySpecsRepository.save(newCategorySpecs);
          }
        }
      }
    }

    const result = await this.findOne(saved.id);
    if (!result) {
      throw new Error('Failed to create product');
    }
    return result;
  }

  private extractKeyFromUrl(url: string): string | null {
    if (!url) return null;
    // Если это уже ключ (не начинается с http), возвращаем как есть
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return url;
    }
    
    try {
      // Декодируем URL и убираем query string
      const decodedUrl = decodeURIComponent(url);
      const urlWithoutQuery = decodedUrl.split('?')[0].split('%3F')[0];
      const parts = urlWithoutQuery.split('/').filter(part => part.length > 0);
      
      // Ищем индекс домена twcstorage.ru
      const domainIndex = parts.findIndex(part => part.includes('twcstorage.ru'));
      if (domainIndex < 0) {
        // Fallback: берем последние 2 части
        return parts.length >= 2 ? parts.slice(-2).join('/') : null;
      }

      // После домена идет имя бакета (может быть одно или два раза)
      let startIndex = domainIndex + 1;
      
      // Пропускаем имя бакета (может быть дублировано)
      if (startIndex < parts.length) {
        const bucketName = parts[startIndex];
        startIndex++;
        // Если следующая часть тоже имя бакета (дублирование), пропускаем
        if (startIndex < parts.length && parts[startIndex] === bucketName) {
          startIndex++;
        }
      }

      // Все что после бакета - это путь к файлу
      if (startIndex < parts.length) {
        return parts.slice(startIndex).join('/');
      }

      // Fallback: берем последние 2 части
      return parts.length >= 2 ? parts.slice(-2).join('/') : null;
    } catch (e) {
      // Если декодирование не удалось, пробуем без декодирования
      const urlWithoutQuery = url.split('?')[0].split('%3F')[0];
      const parts = urlWithoutQuery.split('/').filter(part => part.length > 0);
      const domainIndex = parts.findIndex(part => part.includes('twcstorage.ru'));
      if (domainIndex < 0) {
        return parts.length >= 2 ? parts.slice(-2).join('/') : null;
      }

      let startIndex = domainIndex + 1;
      if (startIndex < parts.length) {
        const bucketName = parts[startIndex];
        startIndex++;
        if (startIndex < parts.length && parts[startIndex] === bucketName) {
          startIndex++;
        }
      }

      if (startIndex < parts.length) {
        return parts.slice(startIndex).join('/');
      }
      return parts.length >= 2 ? parts.slice(-2).join('/') : null;
    }
  }

  async update(id: number, product: Partial<Product> & { categoryIds?: number[] }): Promise<Product | null> {
    // Получаем существующий продукт напрямую из БД (без преобразования URL)
    const existingProduct = await this.productsRepository.findOne({ 
      where: { id },
      relations: ['categories']
    });
    if (!existingProduct) return null;

    // Обрабатываем изображения (теперь все в массиве images)
    // Важно: product.images уже содержит ключи существующих изображений + новые ключи из контроллера
    if (product.images !== undefined) {
      if (Array.isArray(product.images) && product.images.length > 0) {
        // product.images уже содержит ключи (не URL), так как они приходят из контроллера
        // где новые файлы загружены и их ключи добавлены к существующим ключам
        // Но на всякий случай проверяем и нормализуем
        const finalKeys = product.images
          .map(img => {
            if (!img) return null;
            // Если это URL (не должно быть, но на всякий случай), извлекаем ключ
            if (img.startsWith('http://') || img.startsWith('https://')) {
              return this.extractKeyFromUrl(img);
            }
            // Это уже ключ, возвращаем как есть
            return img;
          })
          .filter((key): key is string => key !== null && key !== undefined && key !== '');
        
        // Собираем все старые ключи (из массива images и из поля image)
        const allOldKeys: string[] = [];
        
        if (existingProduct.images && existingProduct.images.length > 0) {
          const oldKeysFromArray = existingProduct.images
            .map(img => {
              if (!img) return null;
              // В БД хранятся ключи, но на всякий случай проверяем
              if (img.startsWith('http://') || img.startsWith('https://')) {
                return this.extractKeyFromUrl(img);
              }
              return img;
            })
            .filter((key): key is string => key !== null && key !== undefined);
          allOldKeys.push(...oldKeysFromArray);
        }
        
        // Если есть старое поле image, но его нет в массиве, добавляем его ключ
        if (existingProduct.image) {
          const oldImageKey = existingProduct.image.startsWith('http://') || existingProduct.image.startsWith('https://')
            ? this.extractKeyFromUrl(existingProduct.image)
            : existingProduct.image;
          if (oldImageKey && !allOldKeys.some(k => k === oldImageKey)) {
            allOldKeys.push(oldImageKey);
          }
        }
        
        // Нормализуем ключи для сравнения (убираем пробелы и приводим к нижнему регистру)
        const normalizedFinalKeys = new Set(finalKeys.map(key => {
          if (!key) return '';
          return key.trim().toLowerCase();
        }).filter(k => k !== ''));
        
        // Удаляем старые изображения, которых нет в новых
        const keysToDelete = allOldKeys.filter(oldKey => {
          if (!oldKey) return false;
          const normalizedOldKey = oldKey.trim().toLowerCase();
          return !normalizedFinalKeys.has(normalizedOldKey);
        });
        
        if (keysToDelete.length > 0) {
          await this.storageService.deleteFiles(keysToDelete);
        }
        
        // Сохраняем ключи в правильном порядке (первое - главное)
        // Порядок уже правильный: существующие в нужном порядке + новые в конце
        product.images = finalKeys;
        // Очищаем старое поле image, так как теперь все в массиве
        product.image = null;
      } else {
        // Если передан пустой массив, удаляем все старые изображения
        const allOldKeys: string[] = [];
        
        if (existingProduct.images && existingProduct.images.length > 0) {
          const oldKeysFromArray = existingProduct.images
            .map(img => {
              if (img && (img.startsWith('http://') || img.startsWith('https://'))) {
                return this.extractKeyFromUrl(img);
              }
              return img;
            })
            .filter((key): key is string => key !== null && key !== undefined);
          allOldKeys.push(...oldKeysFromArray);
        }
        
        if (existingProduct.image) {
          const oldImageKey = existingProduct.image.startsWith('http://') || existingProduct.image.startsWith('https://')
            ? this.extractKeyFromUrl(existingProduct.image)
            : existingProduct.image;
          if (oldImageKey) {
            allOldKeys.push(oldImageKey);
          }
        }
        
        if (allOldKeys.length > 0) {
          await this.storageService.deleteFiles(allOldKeys);
        }
        
        product.images = [];
        product.image = null;
      }
    }

    // Обрабатываем видео
    if (product.video === null || product.video === undefined) {
      // Если передано null, удаляем старое видео
      if (existingProduct.video) {
        const oldKey = this.extractKeyFromUrl(existingProduct.video);
        if (oldKey) {
          await this.storageService.deleteFile(oldKey);
        }
        product.video = null;
      }
    } else if (product.video && existingProduct.video) {
      // Если передано новое видео и есть старое
      const newKey = this.extractKeyFromUrl(product.video);
      const oldKey = this.extractKeyFromUrl(existingProduct.video);
      // Сравниваем нормализованные ключи
      if (newKey && oldKey && newKey.trim().toLowerCase() !== oldKey.trim().toLowerCase()) {
        await this.storageService.deleteFile(oldKey);
      }
      if (newKey) {
        product.video = newKey;
      }
    } else if (product.video) {
      // Если передано новое видео, но старого не было
      const newKey = this.extractKeyFromUrl(product.video);
      if (newKey) {
        product.video = newKey;
      }
    }

    const { specifications, categoryIds, ...productData } = product;
    
    // Обновляем категории если указаны
    if (categoryIds !== undefined) {
      if (Array.isArray(categoryIds) && categoryIds.length > 0) {
        const categories = await this.categoriesRepository.find({
          where: { id: In(categoryIds) }
        });
        existingProduct.categories = categories;
      } else {
        existingProduct.categories = [];
      }
    }
    
    await this.productsRepository.save(existingProduct);
    await this.productsRepository.update(id, productData);

    // Обновляем характеристики товара
    if (specifications !== undefined) {
      // Удаляем старые характеристики
      await this.productSpecsRepository.delete({ productId: id });

      // Добавляем новые характеристики
      if (Array.isArray(specifications) && specifications.length > 0) {
        const specsToSave = specifications.map((spec: { name: string; value: string }) => {
          return this.productSpecsRepository.create({
            productId: id,
            name: spec.name,
            value: spec.value,
          });
        });
        await this.productSpecsRepository.save(specsToSave);

        // Обновляем список характеристик для всех категорий товара
        const updatedProduct = await this.productsRepository.findOne({ 
          where: { id },
          relations: ['categories']
        });
        
        if (updatedProduct && updatedProduct.categories && updatedProduct.categories.length > 0) {
          for (const category of updatedProduct.categories) {
            const existingCategorySpecs = await this.categorySpecsRepository.find({
              where: { categoryId: category.id },
            });
            const existingNames = new Set(existingCategorySpecs.map(s => s.name));

            const newCategorySpecs = specifications
              .map((spec: { name: string; value: string }) => spec.name)
              .filter((name: string) => !existingNames.has(name))
              .map((name: string) => {
                return this.categorySpecsRepository.create({
                  categoryId: category.id,
                  name: name,
                });
              });

            if (newCategorySpecs.length > 0) {
              await this.categorySpecsRepository.save(newCategorySpecs);
            }
          }
        }
      }
    }

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
        const allImageKeys: string[] = [];
        
        // Собираем ключи из массива images
        if (product.images && product.images.length > 0) {
          const imageKeys = product.images
            .map(img => this.extractKeyFromUrl(img))
            .filter((key): key is string => key !== null);
          allImageKeys.push(...imageKeys);
        }
        
        // Если есть старое поле image, добавляем его ключ
        if (product.image) {
          const imageKey = this.extractKeyFromUrl(product.image);
          if (imageKey && !allImageKeys.includes(imageKey)) {
            allImageKeys.push(imageKey);
          }
        }
        
        if (allImageKeys.length > 0) {
          try {
            await this.storageService.deleteFiles(allImageKeys);
          } catch (error) {
            console.error('Ошибка при удалении изображений:', error);
            // Продолжаем удаление товара даже если файлы не удалось удалить
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


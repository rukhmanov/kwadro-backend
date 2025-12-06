import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, NotFoundException, UseInterceptors, UploadedFile, UploadedFiles } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { ProductsService } from './products.service';
import { Product } from '../entities/product.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService } from '../storage/storage.service';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  async findAll(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('inStock') inStock?: string,
    @Query('isFeatured') isFeatured?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<Product[] | { products: Product[]; total: number; page: number; limit: number; totalPages: number }> {
    const hasPaginationParams = page !== undefined || limit !== undefined;
    const hasFilterParams = search !== undefined || sortBy !== undefined || sortOrder !== undefined || 
                           minPrice !== undefined || maxPrice !== undefined || inStock !== undefined || isFeatured !== undefined;

    // Если есть параметры пагинации или фильтров, возвращаем объект с пагинацией
    if (hasPaginationParams || hasFilterParams) {
      const filters = {
        categoryId: categoryId ? +categoryId : undefined,
        search: search || undefined,
        sortBy: sortBy || 'createdAt',
        sortOrder: (sortOrder || 'DESC') as 'ASC' | 'DESC',
        minPrice: minPrice ? +minPrice : undefined,
        maxPrice: maxPrice ? +maxPrice : undefined,
        inStock: inStock === 'true' ? true : inStock === 'false' ? false : undefined,
        isFeatured: isFeatured === 'true' ? true : isFeatured === 'false' ? false : undefined,
        page: page ? +page : 1,
        limit: limit ? +limit : 15,
      };
      return this.productsService.findAll(filters);
    }

    // Для обратной совместимости: если только categoryId, возвращаем массив
    if (categoryId) {
      return this.productsService.findByCategory(+categoryId);
    }
    return this.productsService.findAll();
  }

  @Get('category/:categoryId/specifications')
  async getCategorySpecifications(@Param('categoryId') categoryId: string): Promise<string[]> {
    return this.productsService.getCategorySpecifications(+categoryId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Product> {
    const product = await this.productsService.findOne(+id);
    if (!product) {
      throw new NotFoundException('Товар не найден');
    }
    return product;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(AnyFilesInterceptor())
  async create(
    @Body() productData: any,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<Product> {
    let product: Partial<Product>;
    
    // Пытаемся распарсить JSON из поля product, если оно есть
    if (productData.product && typeof productData.product === 'string') {
      try {
        product = JSON.parse(productData.product);
      } catch {
        product = productData;
      }
    } else {
      product = productData;
    }
    
    if (files && files.length > 0) {
      // Разделяем файлы по типам
      const imageFiles: Express.Multer.File[] = [];
      let videoFile: Express.Multer.File | null = null;

      for (const file of files) {
        if (file.fieldname === 'video' || file.mimetype.startsWith('video/')) {
          videoFile = file;
        } else if (file.fieldname === 'images' || file.mimetype.startsWith('image/')) {
          imageFiles.push(file);
        }
      }

      // Загружаем все изображения в массив images
      if (imageFiles.length > 0) {
        const uploadedImages = await this.storageService.uploadFiles(imageFiles, 'products');
        product.images = uploadedImages;
      }

      // Загружаем видео, если оно есть
      if (videoFile) {
        const videoKey = await this.storageService.uploadFile(videoFile, 'products');
        product.video = videoKey;
      }
    }
    
    return this.productsService.create(product);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(AnyFilesInterceptor())
  async update(
    @Param('id') id: string,
    @Body() productData: any,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<Product> {
    let product: Partial<Product>;
    
    // Пытаемся распарсить JSON из поля product, если оно есть
    if (productData.product && typeof productData.product === 'string') {
      try {
        product = JSON.parse(productData.product);
      } catch {
        product = productData;
      }
    } else {
      product = productData;
    }
    
    if (files && files.length > 0) {
      // Разделяем файлы по типам
      const imageFiles: Express.Multer.File[] = [];
      let videoFile: Express.Multer.File | null = null;

      for (const file of files) {
        if (file.fieldname === 'video' || file.mimetype.startsWith('video/')) {
          videoFile = file;
        } else if (file.fieldname === 'images' || file.mimetype.startsWith('image/')) {
          imageFiles.push(file);
        }
      }

      // Загружаем новые изображения, если они есть
      if (imageFiles.length > 0) {
        const newImageKeys = await this.storageService.uploadFiles(imageFiles, 'products');
        // Новые изображения добавляются в конец существующих (сохраняем порядок)
        // product.images уже содержит ключи существующих изображений в правильном порядке
        if (product.images && Array.isArray(product.images) && product.images.length > 0) {
          // Существующие изображения уже в правильном порядке из фронтенда (это ключи, не URL)
          // Новые ключи добавляем в конец
          product.images = [...product.images, ...newImageKeys];
        } else {
          product.images = newImageKeys;
        }
      }

      // Загружаем новое видео, если оно есть
      if (videoFile) {
        const videoKey = await this.storageService.uploadFile(videoFile, 'products');
        product.video = videoKey;
      }
    }
    
    const updated = await this.productsService.update(+id, product);
    if (!updated) {
      throw new NotFoundException('Товар не найден');
    }
    return updated;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string): Promise<void> {
    return this.productsService.remove(+id);
  }
}


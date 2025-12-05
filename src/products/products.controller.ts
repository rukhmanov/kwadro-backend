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
  findAll(@Query('categoryId') categoryId?: string): Promise<Product[]> {
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


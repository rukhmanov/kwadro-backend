import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, NotFoundException, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CategoriesService } from './categories.service';
import { Category } from '../entities/category.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService } from '../storage/storage.service';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  findAll(): Promise<Category[]> {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Category> {
    const category = await this.categoriesService.findOne(+id);
    if (!category) {
      throw new NotFoundException('Категория не найдена');
    }
    return category;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @Body() categoryData: any,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<Category> {
    let category: Partial<Category>;
    
    // Пытаемся распарсить JSON из поля category, если оно есть
    if (categoryData.category && typeof categoryData.category === 'string') {
      try {
        category = JSON.parse(categoryData.category);
      } catch {
        category = categoryData;
      }
    } else {
      category = categoryData;
    }
    
    // Загружаем изображение, если оно есть
    if (file) {
      const imageKey = await this.storageService.uploadFile(file, 'categories');
      category.image = imageKey;
    }
    
    return this.categoriesService.create(category);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image'))
  async update(
    @Param('id') id: string,
    @Body() categoryData: any,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<Category> {
    let category: Partial<Category>;
    
    // Пытаемся распарсить JSON из поля category, если оно есть
    if (categoryData.category && typeof categoryData.category === 'string') {
      try {
        category = JSON.parse(categoryData.category);
      } catch {
        category = categoryData;
      }
    } else {
      category = categoryData;
    }
    
    // Загружаем новое изображение, если оно есть
    if (file) {
      const imageKey = await this.storageService.uploadFile(file, 'categories');
      category.image = imageKey;
    }
    
    const updated = await this.categoriesService.update(+id, category);
    if (!updated) {
      throw new NotFoundException('Категория не найдена');
    }
    return updated;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string): Promise<void> {
    return this.categoriesService.remove(+id);
  }

  @Post('reorder')
  @UseGuards(JwtAuthGuard)
  updateOrder(@Body() categoryOrders: { id: number; order: number }[]): Promise<void> {
    return this.categoriesService.updateOrder(categoryOrders);
  }
}


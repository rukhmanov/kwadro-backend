import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, NotFoundException, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { CategoriesService, CategorySpecInput } from './categories.service';
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

  @Post('reorder')
  @UseGuards(JwtAuthGuard)
  updateOrder(@Body() categoryOrders: { id: number; order: number }[]): Promise<void> {
    return this.categoriesService.updateOrder(categoryOrders);
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
  @UseInterceptors(AnyFilesInterceptor())
  async create(
    @Body() categoryData: any,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<Category> {
    const category = await this.parseCategoryPayload(categoryData, files);
    return this.categoriesService.create(category);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(AnyFilesInterceptor())
  async update(
    @Param('id') id: string,
    @Body() categoryData: any,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<Category> {
    const category = await this.parseCategoryPayload(categoryData, files);
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

  private async parseCategoryPayload(
    categoryData: any,
    files?: Express.Multer.File[],
  ): Promise<Partial<Category> & { specifications?: CategorySpecInput[] }> {
    let category: Partial<Category> & { specifications?: CategorySpecInput[] };

    if (categoryData.category && typeof categoryData.category === 'string') {
      try {
        category = JSON.parse(categoryData.category);
      } catch {
        category = categoryData;
      }
    } else {
      category = categoryData;
    }

    const specImageKeys = new Map<number, string>();
    for (const file of files || []) {
      if (file.fieldname === 'image') {
        category.image = await this.storageService.uploadFile(file, 'categories');
      } else if (file.fieldname.startsWith('specImage_')) {
        const index = Number(file.fieldname.replace('specImage_', ''));
        if (!Number.isNaN(index)) {
          specImageKeys.set(index, await this.storageService.uploadFile(file, 'category-specs'));
        }
      }
    }

    if (category.specifications?.length && specImageKeys.size > 0) {
      category.specifications = category.specifications.map((spec, index) => {
        const uploadedKey = specImageKeys.get(index);
        if (!uploadedKey) {
          return spec;
        }
        return {
          ...spec,
          image: uploadedKey,
          removeImage: false,
        };
      });
    }

    return category;
  }
}

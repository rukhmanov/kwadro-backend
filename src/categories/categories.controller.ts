import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Category } from '../entities/category.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

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
  create(@Body() category: Partial<Category>): Promise<Category> {
    return this.categoriesService.create(category);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Body() category: Partial<Category>): Promise<Category> {
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
}


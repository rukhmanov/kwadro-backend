import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    private storageService: StorageService,
  ) {}

  private async transformCategory(category: Category): Promise<Category> {
    if (!category) return category;
    
    if (category.image) {
      const url = await this.storageService.getFileUrl(category.image);
      if (url) {
        category.image = url;
      }
    }
    
    return category;
  }

  async findAll(): Promise<Category[]> {
    const categories = await this.categoriesRepository.find({ 
      relations: ['products'],
      order: { order: 'ASC' }
    });
    return Promise.all(categories.map(c => this.transformCategory(c)));
  }

  async findOne(id: number): Promise<Category | null> {
    const category = await this.categoriesRepository.findOne({ where: { id }, relations: ['products'] });
    return category ? await this.transformCategory(category) : null;
  }

  async create(category: Partial<Category>): Promise<Category> {
    // Если order не указан, устанавливаем его как максимальный + 1
    if (category.order === undefined || category.order === null) {
      const maxOrder = await this.categoriesRepository
        .createQueryBuilder('category')
        .select('MAX(category.order)', 'max')
        .getRawOne();
      category.order = (maxOrder?.max || 0) + 1;
    }
    const newCategory = this.categoriesRepository.create(category);
    const saved = await this.categoriesRepository.save(newCategory);
    return await this.transformCategory(saved);
  }

  private extractKeyFromUrl(url: string): string | null {
    if (!url) return null;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return url;
    }
    const parts = url.split('/');
    const bucketIndex = parts.findIndex(part => part.includes('parsifal-files') || part.includes('twcstorage'));
    if (bucketIndex >= 0 && bucketIndex < parts.length - 1) {
      return parts.slice(bucketIndex + 1).join('/');
    }
    return parts.slice(-2).join('/');
  }

  async update(id: number, category: Partial<Category>): Promise<Category | null> {
    const existingCategory = await this.categoriesRepository.findOne({ where: { id } });
    if (!existingCategory) return null;

    // Удаляем старое изображение, если оно было заменено
    if (category.image && existingCategory.image) {
      const newKey = this.extractKeyFromUrl(category.image);
      const oldKey = this.extractKeyFromUrl(existingCategory.image);
      if (newKey && oldKey && newKey !== oldKey) {
        await this.storageService.deleteFile(oldKey);
      }
      if (newKey) {
        category.image = newKey;
      }
    }

    await this.categoriesRepository.update(id, category);
    return await this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (category && category.image) {
      await this.storageService.deleteFile(category.image);
    }
    await this.categoriesRepository.delete(id);
  }

  async updateOrder(categoryOrders: { id: number; order: number }[]): Promise<void> {
    await Promise.all(
      categoryOrders.map(({ id, order }) =>
        this.categoriesRepository.update(id, { order })
      )
    );
  }
}


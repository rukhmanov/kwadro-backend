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
      return url; // Уже ключ, не URL
    }

    const urlWithoutQuery = url.split('?')[0].split('%3F')[0];
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


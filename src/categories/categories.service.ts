import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.categoriesRepository.find({ 
      relations: ['products'],
      order: { order: 'ASC' }
    });
  }

  findOne(id: number): Promise<Category | null> {
    return this.categoriesRepository.findOne({ where: { id }, relations: ['products'] });
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
    return this.categoriesRepository.save(newCategory);
  }

  async update(id: number, category: Partial<Category>): Promise<Category | null> {
    await this.categoriesRepository.update(id, category);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
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


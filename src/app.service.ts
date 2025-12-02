import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import { CategoriesService } from './categories/categories.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    private authService: AuthService,
    private categoriesService: CategoriesService,
  ) {}

  async onModuleInit() {
    await this.initializeAdmin();
    await this.initializeCategories();
  }

  async initializeAdmin() {
    const adminExists = await this.authService.findByUsername('admin');
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin', 10);
      await this.authService.createUser({
        username: 'admin',
        password: hashedPassword,
        isAdmin: true,
      });
      console.log('Admin user created: admin/admin');
    }
  }

  async initializeCategories() {
    const categories = [
      'Квадроциклы',
      'Мотоциклы',
      'Снегоходы',
      'Аксессуары',
      'Экипировка',
      'Прицепы',
      'Сноубайки',
    ];

    const existingCategories = await this.categoriesService.findAll();
    const existingNames = existingCategories.map((cat) => cat.name);

    for (const categoryName of categories) {
      if (!existingNames.includes(categoryName)) {
        await this.categoriesService.create({
          name: categoryName,
        });
        console.log(`Category created: ${categoryName}`);
      }
    }
  }
}

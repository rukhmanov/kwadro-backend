import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CategoriesService } from '../categories/categories.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const categoriesService = app.get(CategoriesService);

  try {
    // Проверяем, существуют ли уже эти категории
    const existingCategories = await categoriesService.findAll();
    const existingNames = existingCategories.map(c => c.name.toLowerCase());

    const categoriesToAdd = [
      { name: 'Мотоциклы', description: 'Мотоциклы и мототехника' },
      { name: 'Экипировка', description: 'Экипировка для мотоциклистов' }
    ];

    let currentOrder = existingCategories.length;
    for (const categoryData of categoriesToAdd) {
      if (!existingNames.includes(categoryData.name.toLowerCase())) {
        currentOrder++;
        await categoriesService.create({
          name: categoryData.name,
          description: categoryData.description,
          image: undefined,
          order: currentOrder
        });
        console.log(`✅ Категория "${categoryData.name}" успешно добавлена`);
      } else {
        console.log(`⚠️  Категория "${categoryData.name}" уже существует`);
      }
    }

    console.log('✅ Готово!');
  } catch (error) {
    console.error('❌ Ошибка при добавлении категорий:', error);
  } finally {
    await app.close();
  }
}

bootstrap();

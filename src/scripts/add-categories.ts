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
      { name: 'Питбайки', description: 'Питбайки для бездорожья' },
      { name: 'Мопеды', description: 'Мопеды и легкая мототехника' },
      { name: 'Скутеры', description: 'Скутеры для города' },
      { name: 'Квадроциклы', description: 'Квадроциклы и ATV' },
      { name: 'Зимняя техника', description: 'Снегоходы и зимняя мототехника' },
      { name: 'Аксессуары', description: 'Аксессуары для мототехники' },
      { name: 'Экипировка', description: 'Экипировка для мотоциклистов' },
      { name: 'Запасные части', description: 'Запасные части и расходники' },
      { name: 'Масла и смазки', description: 'Моторные масла и смазочные материалы' },
      { name: 'Техника б/у', description: 'Бывшая в употреблении техника' },
      { name: 'Моторные масла', description: 'Моторные масла для мототехники' },
      { name: 'Прочие смазки', description: 'Прочие смазочные материалы' }
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



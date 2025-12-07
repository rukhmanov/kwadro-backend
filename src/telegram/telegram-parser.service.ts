import { Injectable, Logger } from '@nestjs/common';
import { ProductsService } from '../products/products.service';
import { NewsService } from '../news/news.service';
import { CategoriesService } from '../categories/categories.service';

export interface ParsedProduct {
  name: string;
  description?: string;
  price: number;
  oldPrice?: number;
  categoryId: number;
  stock?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  specifications?: Array<{ name: string; value: string }>;
}

export interface ParsedNews {
  title: string;
  content: string;
}

@Injectable()
export class TelegramParserService {
  private readonly logger = new Logger(TelegramParserService.name);

  constructor(
    private productsService: ProductsService,
    private newsService: NewsService,
    private categoriesService: CategoriesService,
  ) {}

  /**
   * Парсит сообщение и создает товар, если оно соответствует шаблону
   * @param messageText Текст сообщения из Telegram
   * @param photoKey Ключ фото в хранилище (опционально)
   * @returns true если товар был создан, false если сообщение не подходит под шаблон
   */
  async parseAndCreateProduct(messageText: string, photoKey?: string | null): Promise<boolean> {
    // Проверяем, начинается ли сообщение с "Новый товар!"
    if (!messageText.trim().startsWith('Новый товар!')) {
      return false;
    }

    try {
      const product = await this.parseProduct(messageText);
      if (!product) {
        this.logger.warn('Не удалось распарсить товар из сообщения');
        return false;
      }

      // Преобразуем ParsedProduct в формат, который ожидает ProductsService.create()
      const productData: any = {
        name: product.name,
        price: product.price,
        categoryId: product.categoryId,
        stock: product.stock || 0,
        isActive: product.isActive !== false,
        isFeatured: product.isFeatured || false,
      };

      if (product.description) {
        productData.description = product.description;
      }

      if (product.oldPrice) {
        productData.oldPrice = product.oldPrice;
      }

      if (product.specifications && product.specifications.length > 0) {
        productData.specifications = product.specifications;
      }

      // Добавляем фото, если оно есть
      if (photoKey) {
        productData.image = photoKey;
        productData.images = [photoKey];
      }

      await this.productsService.create(productData as any);
      this.logger.log(`✅ Товар "${product.name}" успешно создан из Telegram сообщения`);
      return true;
    } catch (error) {
      this.logger.error('Ошибка при создании товара из Telegram сообщения:', error);
      return false;
    }
  }

  /**
   * Парсит сообщение и создает новость, если оно соответствует шаблону
   * @param messageText Текст сообщения из Telegram
   * @param photoKey Ключ фото в хранилище (опционально)
   * @returns true если новость была создана, false если сообщение не подходит под шаблон
   */
  async parseAndCreateNews(messageText: string, photoKey?: string | null): Promise<boolean> {
    // Проверяем, начинается ли сообщение с "Новость!"
    if (!messageText.trim().startsWith('Новость!')) {
      return false;
    }

    try {
      const news = await this.parseNews(messageText);
      if (!news) {
        this.logger.warn('Не удалось распарсить новость из сообщения');
        return false;
      }

      const newsData: any = {
        title: news.title,
        content: news.content,
      };

      // Добавляем фото, если оно есть
      if (photoKey) {
        newsData.image = photoKey;
      }

      await this.newsService.create(newsData);
      this.logger.log(`✅ Новость "${news.title}" успешно создана из Telegram сообщения`);
      return true;
    } catch (error) {
      this.logger.error('Ошибка при создании новости из Telegram сообщения:', error);
      return false;
    }
  }

  /**
   * Парсит текст сообщения в объект товара
   * Шаблон:
   * Новый товар!
   * Название: [название товара]
   * Описание: [описание товара]
   * Цена: [цена]
   * Старая цена: [старая цена] (опционально)
   * Категория: [название категории]
   * Количество: [количество] (опционально, по умолчанию 0)
   * Характеристики:
   * - [название характеристики]: [значение]
   * - [название характеристики]: [значение]
   */
  private async parseProduct(messageText: string): Promise<ParsedProduct | null> {
    const lines = messageText.split('\n').map(line => line.trim()).filter(line => line);
    
    // Пропускаем первую строку "Новый товар!"
    if (lines.length < 2) {
      return null;
    }

    const product: Partial<ParsedProduct> = {
      isActive: true,
      isFeatured: false,
      stock: 0,
    };

    let currentSection: 'main' | 'specifications' = 'main';
    const specifications: Array<{ name: string; value: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // Проверяем, начинается ли секция характеристик
      if (line.toLowerCase() === 'характеристики:' || line.toLowerCase() === 'характеристики') {
        currentSection = 'specifications';
        continue;
      }

      if (currentSection === 'specifications') {
        // Парсим характеристики в формате "- название: значение" или "название: значение"
        const specMatch = line.match(/^[-•]\s*(.+?):\s*(.+)$/i) || line.match(/^(.+?):\s*(.+)$/);
        if (specMatch) {
          specifications.push({
            name: specMatch[1].trim(),
            value: specMatch[2].trim(),
          });
        }
      } else {
        // Парсим основные поля
        const match = line.match(/^(.+?):\s*(.+)$/i);
        if (match) {
          const key = match[1].trim().toLowerCase();
          const value = match[2].trim();

          switch (key) {
            case 'название':
              product.name = value;
              break;
            case 'описание':
              product.description = value;
              break;
            case 'цена':
              const price = this.parsePrice(value);
              if (price !== null) {
                product.price = price;
              }
              break;
            case 'старая цена':
            case 'старая цена:':
              const oldPrice = this.parsePrice(value);
              if (oldPrice !== null) {
                product.oldPrice = oldPrice;
              }
              break;
            case 'категория':
              const categoryId = await this.findCategoryIdByName(value);
              if (categoryId) {
                product.categoryId = categoryId;
              } else {
                this.logger.warn(`Категория "${value}" не найдена. Товар не будет создан.`);
                return null;
              }
              break;
            case 'количество':
            case 'остаток':
            case 'stock':
              const stock = parseInt(value, 10);
              if (!isNaN(stock)) {
                product.stock = stock;
              }
              break;
            case 'активен':
            case 'isactive':
              product.isActive = value.toLowerCase() === 'да' || value.toLowerCase() === 'true' || value === '1';
              break;
            case 'рекомендуемый':
            case 'isfeatured':
              product.isFeatured = value.toLowerCase() === 'да' || value.toLowerCase() === 'true' || value === '1';
              break;
          }
        }
      }
    }

    // Проверяем обязательные поля
    if (!product.name || !product.price || !product.categoryId) {
      this.logger.warn('Не все обязательные поля товара заполнены');
      return null;
    }

    const result: ParsedProduct = {
      name: product.name,
      price: product.price,
      categoryId: product.categoryId,
      stock: product.stock || 0,
      isActive: product.isActive !== false,
      isFeatured: product.isFeatured || false,
    };

    if (product.description) {
      result.description = product.description;
    }

    if (product.oldPrice) {
      result.oldPrice = product.oldPrice;
    }

    if (specifications.length > 0) {
      result.specifications = specifications;
    }

    return result;
  }

  /**
   * Парсит текст сообщения в объект новости
   * Шаблон:
   * Новость!
   * Заголовок: [заголовок новости]
   * Описание: [описание новости]
   */
  private async parseNews(messageText: string): Promise<ParsedNews | null> {
    const lines = messageText.split('\n').map(line => line.trim()).filter(line => line);
    
    // Пропускаем первую строку "Новость!"
    if (lines.length < 2) {
      return null;
    }

    const news: Partial<ParsedNews> = {};

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^(.+?):\s*(.+)$/i);
      
      if (match) {
        const key = match[1].trim().toLowerCase();
        const value = match[2].trim();

        switch (key) {
          case 'заголовок':
            news.title = value;
            break;
          case 'описание':
          case 'текст':
          case 'содержание':
          case 'content':
            news.content = value;
            break;
        }
      } else {
        // Если строка не соответствует формату "ключ: значение", 
        // добавляем её к содержимому (для многострочного текста)
        if (news.content) {
          news.content += '\n' + line;
        } else if (!news.title) {
          // Если заголовок еще не установлен, используем эту строку как заголовок
          news.title = line;
        } else {
          // Иначе добавляем к содержимому
          news.content = line;
        }
      }
    }

    // Проверяем обязательные поля
    if (!news.title || !news.content) {
      this.logger.warn('Не все обязательные поля новости заполнены');
      return null;
    }

    return {
      title: news.title,
      content: news.content,
    };
  }

  /**
   * Парсит цену из строки (удаляет все символы кроме цифр и точки/запятой)
   */
  private parsePrice(priceStr: string): number | null {
    // Удаляем все символы кроме цифр, точки и запятой
    const cleaned = priceStr.replace(/[^\d.,]/g, '').replace(',', '.');
    const price = parseFloat(cleaned);
    return isNaN(price) ? null : price;
  }

  /**
   * Находит ID категории по названию (регистронезависимый поиск)
   */
  private async findCategoryIdByName(categoryName: string): Promise<number | null> {
    try {
      const categories = await this.categoriesService.findAll();
      const category = categories.find(
        c => c.name.toLowerCase().trim() === categoryName.toLowerCase().trim()
      );
      return category ? category.id : null;
    } catch (error) {
      this.logger.error('Ошибка при поиске категории:', error);
      return null;
    }
  }
}

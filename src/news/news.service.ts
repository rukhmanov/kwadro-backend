import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { News } from '../entities/news.entity';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(News)
    private newsRepository: Repository<News>,
    private storageService: StorageService,
  ) {}

  private async transformNews(news: News): Promise<News> {
    if (!news) return news;
    
    if (news.image) {
      const url = await this.storageService.getFileUrl(news.image);
      if (url) {
        news.image = url;
      }
    }
    
    return news;
  }

  async findAll(): Promise<News[]> {
    const newsList = await this.newsRepository.find({
      order: { createdAt: 'DESC' },
    });
    return Promise.all(newsList.map(n => this.transformNews(n)));
  }

  async findOne(id: number): Promise<News | null> {
    const news = await this.newsRepository.findOne({ where: { id } });
    return news ? await this.transformNews(news) : null;
  }

  async create(news: Partial<News>): Promise<News> {
    const newNews = this.newsRepository.create(news);
    const saved = await this.newsRepository.save(newNews);
    return await this.transformNews(saved);
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

  async update(id: number, news: Partial<News>): Promise<News | null> {
    const existingNews = await this.newsRepository.findOne({ where: { id } });
    if (!existingNews) return null;

    // Удаляем старое изображение, если оно было заменено
    if (news.image && existingNews.image) {
      const newKey = this.extractKeyFromUrl(news.image);
      const oldKey = this.extractKeyFromUrl(existingNews.image);
      if (newKey && oldKey && newKey !== oldKey) {
        await this.storageService.deleteFile(oldKey);
      }
      if (newKey) {
        news.image = newKey;
      }
    }

    await this.newsRepository.update(id, news);
    return await this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const news = await this.newsRepository.findOne({ where: { id } });
    if (news && news.image) {
      await this.storageService.deleteFile(news.image);
    }
    await this.newsRepository.delete(id);
  }
}


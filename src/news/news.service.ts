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

  private transformNews(news: News): News {
    if (!news) return news;
    
    if (news.image) {
      const url = this.storageService.getFileUrl(news.image);
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
    return newsList.map(n => this.transformNews(n));
  }

  async findOne(id: number): Promise<News | null> {
    const news = await this.newsRepository.findOne({ where: { id } });
    return news ? this.transformNews(news) : null;
  }

  async create(news: Partial<News>): Promise<News> {
    const newNews = this.newsRepository.create(news);
    const saved = await this.newsRepository.save(newNews);
    return this.transformNews(saved);
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
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const news = await this.newsRepository.findOne({ where: { id } });
    if (news && news.image) {
      await this.storageService.deleteFile(news.image);
    }
    await this.newsRepository.delete(id);
  }
}


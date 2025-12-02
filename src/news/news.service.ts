import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { News } from '../entities/news.entity';

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(News)
    private newsRepository: Repository<News>,
  ) {}

  findAll(): Promise<News[]> {
    return this.newsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  findOne(id: number): Promise<News | null> {
    return this.newsRepository.findOne({ where: { id } });
  }

  create(news: Partial<News>): Promise<News> {
    const newNews = this.newsRepository.create(news);
    return this.newsRepository.save(newNews);
  }

  async update(id: number, news: Partial<News>): Promise<News | null> {
    await this.newsRepository.update(id, news);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.newsRepository.delete(id);
  }
}


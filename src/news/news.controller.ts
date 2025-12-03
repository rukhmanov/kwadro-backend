import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, NotFoundException, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { NewsService } from './news.service';
import { News } from '../entities/news.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService } from '../storage/storage.service';

@Controller('news')
export class NewsController {
  constructor(
    private readonly newsService: NewsService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  findAll(): Promise<News[]> {
    return this.newsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<News> {
    const news = await this.newsService.findOne(+id);
    if (!news) {
      throw new NotFoundException('Новость не найдена');
    }
    return news;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @Body() newsData: any,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<News> {
    let news: Partial<News>;
    
    // Пытаемся распарсить JSON из поля news, если оно есть
    if (newsData.news && typeof newsData.news === 'string') {
      try {
        news = JSON.parse(newsData.news);
      } catch {
        news = newsData;
      }
    } else {
      news = newsData;
    }
    
    // Загружаем изображение, если оно есть
    if (file) {
      const imageKey = await this.storageService.uploadFile(file, 'news');
      news.image = imageKey;
    }
    
    return this.newsService.create(news);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image'))
  async update(
    @Param('id') id: string,
    @Body() newsData: any,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<News> {
    let news: Partial<News>;
    
    // Пытаемся распарсить JSON из поля news, если оно есть
    if (newsData.news && typeof newsData.news === 'string') {
      try {
        news = JSON.parse(newsData.news);
      } catch {
        news = newsData;
      }
    } else {
      news = newsData;
    }
    
    // Загружаем новое изображение, если оно есть
    if (file) {
      const imageKey = await this.storageService.uploadFile(file, 'news');
      news.image = imageKey;
    }
    
    const updated = await this.newsService.update(+id, news);
    if (!updated) {
      throw new NotFoundException('Новость не найдена');
    }
    return updated;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string): Promise<void> {
    return this.newsService.remove(+id);
  }
}


import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, NotFoundException } from '@nestjs/common';
import { NewsService } from './news.service';
import { News } from '../entities/news.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

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
  create(@Body() news: Partial<News>): Promise<News> {
    return this.newsService.create(news);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Body() news: Partial<News>): Promise<News> {
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


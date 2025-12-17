import { Controller, Get, Post, UseGuards, UseInterceptors, UploadedFile, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { StorageService } from '../storage/storage.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  async getAllSettings() {
    return this.settingsService.getAllSettings();
  }

  @Get('background-image')
  async getBackgroundImage() {
    const url = await this.settingsService.getSetting('background_image');
    return { url };
  }

  @Post('background-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image'))
  async uploadBackgroundImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error('No file uploaded');
    }

    const imageKey = await this.storageService.uploadFile(file, 'settings');
    await this.settingsService.setSetting('background_image', imageKey);
    
    const url = await this.storageService.getFileUrl(imageKey);
    return { url };
  }

  @Post('background-image/remove')
  @UseGuards(JwtAuthGuard)
  async removeBackgroundImage() {
    const setting = await this.settingsService.getSetting('background_image');
    if (setting) {
      // Извлекаем ключ из URL для удаления
      const urlWithoutQuery = setting.split('?')[0].split('%3F')[0];
      const parts = urlWithoutQuery.split('/').filter(part => part.length > 0);
      
      // Ищем индекс домена twcstorage.ru
      const domainIndex = parts.findIndex(part => part.includes('twcstorage.ru'));
      if (domainIndex >= 0) {
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
          const key = parts.slice(startIndex).join('/');
          await this.storageService.deleteFile(key);
        }
      } else if (!setting.startsWith('http://') && !setting.startsWith('https://')) {
        // Если это уже ключ (не URL), используем как есть
        await this.storageService.deleteFile(setting);
      }
    }
    await this.settingsService.setSetting('background_image', null);
    return { success: true };
  }
}


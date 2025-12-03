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
      const parts = setting.split('/');
      const bucketIndex = parts.findIndex(part => part.includes('parsifal-files') || part.includes('twcstorage'));
      if (bucketIndex >= 0 && bucketIndex < parts.length - 1) {
        const key = parts.slice(bucketIndex + 1).join('/');
        await this.storageService.deleteFile(key);
      }
    }
    await this.settingsService.setSetting('background_image', null);
    return { success: true };
  }
}


import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settings } from '../entities/settings.entity';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Settings)
    private settingsRepository: Repository<Settings>,
    private storageService: StorageService,
  ) {}

  async getSetting(key: string): Promise<string | null> {
    const setting = await this.settingsRepository.findOne({ where: { key } });
    if (!setting || !setting.value) return null;
    
    // Если это URL, возвращаем как есть
    if (setting.value.startsWith('http://') || setting.value.startsWith('https://')) {
      return setting.value;
    }
    
    // Иначе получаем URL из S3
    const url = await this.storageService.getFileUrl(setting.value);
    return url;
  }

  async setSetting(key: string, value: string | null): Promise<void> {
    let setting = await this.settingsRepository.findOne({ where: { key } });
    
    if (setting) {
      setting.value = value;
      setting.updatedAt = new Date();
      await this.settingsRepository.save(setting);
    } else if (value !== null) {
      setting = this.settingsRepository.create({ key, value });
      await this.settingsRepository.save(setting);
    }
  }

  async getAllSettings(): Promise<Record<string, string | null>> {
    const settings = await this.settingsRepository.find();
    const result: Record<string, string | null> = {};
    
    for (const setting of settings) {
      if (setting.value) {
        if (setting.value.startsWith('http://') || setting.value.startsWith('https://')) {
          result[setting.key] = setting.value;
        } else {
          const url = await this.storageService.getFileUrl(setting.value);
          result[setting.key] = url;
        }
      } else {
        result[setting.key] = null;
      }
    }
    
    return result;
  }
}


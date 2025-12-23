import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StorageService } from '../storage/storage.service';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const storageService = app.get(StorageService);

  try {
    // Путь для сохранения файлов (относительно корня проекта)
    const localDir = path.join(process.cwd(), 's3-backup');
    
    console.log('📦 Начинаю синхронизацию файлов из S3...');
    console.log(`📁 Файлы будут сохранены в: ${localDir}`);
    console.log('');

    // Опционально: можно указать префикс для фильтрации (например, 'products/')
    // Если нужно скачать все файлы, оставьте undefined
    const prefix = process.argv[2] || undefined;
    
    if (prefix) {
      console.log(`🔍 Фильтр: только файлы с префиксом "${prefix}"`);
    } else {
      console.log('🔍 Скачиваю все файлы из bucket');
    }
    console.log('');

    const startTime = Date.now();
    const result = await storageService.downloadAllFiles(localDir, prefix);
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('📊 Результаты синхронизации:');
    console.log(`   Всего файлов: ${result.total}`);
    console.log(`   ✓ Успешно скачано: ${result.downloaded}`);
    console.log(`   ✗ Ошибок: ${result.failed}`);
    console.log(`   ⏱  Время выполнения: ${duration} сек`);
    console.log('═══════════════════════════════════════');

    if (result.errors.length > 0) {
      console.log('');
      console.log('❌ Ошибки:');
      result.errors.forEach((error) => console.log(`   - ${error}`));
    }

    if (result.downloaded > 0) {
      console.log('');
      console.log(`✅ Синхронизация завершена! Файлы сохранены в: ${localDir}`);
    }
  } catch (error) {
    console.error('❌ Ошибка при синхронизации файлов:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();




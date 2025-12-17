import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private s3Url: string;

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get<string>('S3_BUCKET_NAME') || 'e1ba1f72-7761414f-593a-42ea-b9df-8cc7ab126345';
    this.s3Url = this.configService.get<string>('S3_URL') || 'https://s3.twcstorage.ru';

    this.s3Client = new S3Client({
      endpoint: this.s3Url,
      region: this.configService.get<string>('S3_REGION') || 'ru-1',
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY') || 'O1EVZYQ82Z4RPBN01E82',
        secretAccessKey: this.configService.get<string>('S3_SECRET_KEY') || 'N1tSdSXW4txVBAA1ZLAsltHcIV0r3q9BaYBOINSk',
      },
      forcePathStyle: true,
    });
  }

  /**
   * Загружает файл в S3
   * @param file - файл для загрузки
   * @param folder - папка для хранения (например, 'products', 'news', 'categories')
   * @returns ключ файла в S3
   */
  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = file.originalname.split('.').pop();
    const fileName = `${folder}/${timestamp}-${randomString}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
      // ACL может не поддерживаться в некоторых S3-совместимых хранилищах
      // Доступ настраивается через политики бакета
    });

    await this.s3Client.send(command);
    return fileName;
  }

  /**
   * Загружает несколько файлов в S3
   * @param files - массив файлов для загрузки
   * @param folder - папка для хранения
   * @returns массив ключей файлов в S3
   */
  async uploadFiles(files: Express.Multer.File[], folder: string): Promise<string[]> {
    const uploadPromises = files.map((file) => this.uploadFile(file, folder));
    return Promise.all(uploadPromises);
  }

  /**
   * Удаляет файл из S3
   * @param key - ключ файла в S3
   */
  async deleteFile(key: string): Promise<void> {
    if (!key) return;

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  /**
   * Удаляет несколько файлов из S3
   * @param keys - массив ключей файлов в S3
   */
  async deleteFiles(keys: string[]): Promise<void> {
    if (!keys || keys.length === 0) return;

    const deletePromises = keys.map((key) => this.deleteFile(key));
    await Promise.all(deletePromises);
  }

  /**
   * Получает подписанный URL файла из S3 (для доступа к приватным файлам)
   * @param key - ключ файла в S3
   * @param expiresIn - время жизни URL в секундах (по умолчанию 7 дней)
   * @returns подписанный URL файла
   */
  /**
   * Извлекает ключ файла из полного URL
   * Работает с любым именем бакета (старым и новым)
   */
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
    // Формат: https://s3.twcstorage.ru/bucket-name/bucket-name/folder/file.ext
    // или: https://s3.twcstorage.ru/bucket-name/folder/file.ext
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

  async getFileUrl(key: string, expiresIn: number = 604800): Promise<string | null> {
    if (!key) return null;
    
    // Если ключ уже является полным URL (с параметрами подписи), возвращаем его
    if (key.startsWith('http://') || key.startsWith('https://')) {
      // Проверяем, есть ли уже параметры подписи в URL
      if (key.includes('X-Amz-Signature') || key.includes('X-Amz-Algorithm')) {
        return key;
      }
      // Если это простой URL без подписи, извлекаем ключ и создаем подписанный
      const extractedKey = this.extractKeyFromUrl(key);
      if (extractedKey) {
        return await this.getSignedFileUrl(extractedKey, expiresIn);
      }
      // Fallback: берем последние части как ключ
      const parts = key.split('/');
      const fallbackKey = parts.slice(-2).join('/');
      return await this.getSignedFileUrl(fallbackKey, expiresIn);
    }

    // Генерируем подписанный URL для ключа
    return await this.getSignedFileUrl(key, expiresIn);
  }

  /**
   * Получает подписанный URL для временного доступа к файлу
   * @param key - ключ файла в S3
   * @param expiresIn - время жизни URL в секундах (по умолчанию 1 час)
   * @returns подписанный URL
   */
  async getSignedFileUrl(key: string, expiresIn: number = 3600): Promise<string | null> {
    if (!key) return null;

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Получает список всех файлов в bucket
   * @param prefix - префикс для фильтрации (например, 'products/', 'news/')
   * @returns массив ключей файлов
   */
  async listAllFiles(prefix?: string): Promise<string[]> {
    const allKeys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await this.s3Client.send(command);

      if (response.Contents) {
        const keys = response.Contents.map((obj) => obj.Key!).filter(Boolean);
        allKeys.push(...keys);
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return allKeys;
  }

  /**
   * Скачивает файл из S3 и сохраняет на локальный диск
   * @param key - ключ файла в S3
   * @param localPath - путь для сохранения файла на локальном диске
   * @returns путь к сохраненному файлу
   */
  async downloadFile(key: string, localPath: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.s3Client.send(command);

    // Создаем директории, если их нет
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Конвертируем stream в buffer и сохраняем
    const chunks: Uint8Array[] = [];
    if (response.Body) {
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      fs.writeFileSync(localPath, buffer);
    }

    return localPath;
  }

  /**
   * Скачивает все файлы из S3 в указанную локальную директорию
   * @param localDir - локальная директория для сохранения файлов
   * @param prefix - префикс для фильтрации файлов (опционально)
   * @returns объект с информацией о скачанных файлах
   */
  async downloadAllFiles(localDir: string, prefix?: string): Promise<{ total: number; downloaded: number; failed: number; errors: string[] }> {
    const files = await this.listAllFiles(prefix);
    let downloaded = 0;
    let failed = 0;
    const errors: string[] = [];

    // Создаем директорию, если её нет
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    for (const key of files) {
      try {
        // Сохраняем структуру папок из S3
        const localPath = path.join(localDir, key);
        await this.downloadFile(key, localPath);
        downloaded++;
        console.log(`✓ Скачан: ${key}`);
      } catch (error) {
        failed++;
        const errorMsg = `Ошибка при скачивании ${key}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.error(`✗ ${errorMsg}`);
      }
    }

    return {
      total: files.length,
      downloaded,
      failed,
      errors,
    };
  }
}


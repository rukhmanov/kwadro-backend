import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as http from 'http';
import { Readable } from 'stream';
import { TelegramParserService } from './telegram-parser.service';
import { StorageService } from '../storage/storage.service';

interface TelegramPhoto {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
      username?: string;
    };
    date: number;
    text?: string;
    photo?: TelegramPhoto[];
    caption?: string;
  };
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private botToken: string;
  private apiUrl: string;
  private lastUpdateId = 0;
  private isRunning = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private conflictErrorCount = 0;
  private readonly MAX_CONFLICT_ERRORS = 3;
  private readonly TARGET_CHANNEL_ID = '-1002472246522'; // ID канала для парсинга товаров и новостей

  constructor(
    private configService: ConfigService,
    private parserService: TelegramParserService,
    private storageService: StorageService,
  ) {
    // Пробуем получить токен из ConfigService, если не получилось - из process.env
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || 
                    process.env.TELEGRAM_BOT_TOKEN || 
                    '';
    this.apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async onModuleInit() {
    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN не установлен. Прослушивание Telegram отключено.');
      return;
    }

    // Не блокируем Nest listen()/healthcheck: api.telegram.org с прода часто ETIMEDOUT
    void this.startBotInBackground();
  }

  private async startBotInBackground() {
    try {
      const botInfo = await this.makeRequest(`${this.apiUrl}/getMe`, 5000);
      if (botInfo.ok) {
        this.logger.log(`🤖 Telegram бот запущен: @${botInfo.result.username}`);
      } else {
        this.logger.error('Не удалось получить информацию о боте');
        return;
      }
    } catch (error) {
      this.logger.error('Ошибка при проверке бота:', error);
      return;
    }

    this.isRunning = true;
    this.startPolling();
  }

  async onModuleDestroy() {
    this.isRunning = false;
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
    }
  }

  private makeRequest(url: string, timeoutMs = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error(`Telegram request timeout after ${timeoutMs}ms`));
      });

      req.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async getUpdates() {
    if (!this.isRunning) {
      return;
    }

    try {
      const url = `${this.apiUrl}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=10`;
      const response = await this.makeRequest(url);

      if (response.ok && response.result) {
        const updates: TelegramUpdate[] = response.result;

        for (const update of updates) {
          this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);

          if (update.message) {
            const msg = update.message;
            const chatType = msg.chat.type;
            const chatId = String(msg.chat.id);
            const chatName = msg.chat.title || msg.chat.username || `Chat ${msg.chat.id}`;
            const userName = msg.from
              ? `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() || 
                msg.from.username || 
                `User ${msg.from.id}`
              : 'Unknown';
            const text = msg.text || msg.caption || '';
            const hasPhoto = msg.photo && msg.photo.length > 0;

            // Обрабатываем сообщения из целевого канала (должен быть текст или caption)
            if (chatId === this.TARGET_CHANNEL_ID && text && text.trim().length > 0) {
              this.logger.log(`📨 Получено сообщение из канала ${chatName} (ID: ${chatId})`);
              this.logger.debug(`Текст сообщения: ${text.substring(0, 100)}...`);
              
              // Скачиваем фото, если оно есть
              let photoKey: string | null = null;
              if (hasPhoto && msg.photo) {
                try {
                  photoKey = await this.downloadPhoto(msg.photo);
                  this.logger.log(`📷 Фото загружено: ${photoKey}`);
                } catch (error) {
                  this.logger.error('Ошибка при загрузке фото:', error);
                }
              }
              
              // Пытаемся создать товар
              const productCreated = await this.parserService.parseAndCreateProduct(text, photoKey);
              
              // Если товар не создан, пытаемся создать новость
              if (!productCreated) {
                await this.parserService.parseAndCreateNews(text, photoKey);
              }
            }

            // Выводим только сообщения из групп и супергрупп (для логирования)
            if (chatType === 'group' || chatType === 'supergroup') {
              const timestamp = new Date(msg.date * 1000).toLocaleString('ru-RU');
              this.logger.log(`\n[${timestamp}] ${chatName} (${chatType})`);
              this.logger.log(`${userName}: ${text}`);
              this.logger.log('─'.repeat(50));
            }
          }
        }
      } else if (response.error_code) {
        if (response.error_code === 401) {
          this.logger.error('Неверный токен бота! Прослушивание остановлено.');
          this.isRunning = false;
          return;
        } else if (response.error_code === 409) {
          // Конфликт: другой экземпляр бота уже получает обновления
          this.conflictErrorCount++;
          
          if (this.conflictErrorCount === 1) {
            this.logger.warn('Обнаружен конфликт: другой экземпляр бота уже получает обновления. Прослушивание остановлено.');
          }
          
          // Если конфликты повторяются, останавливаем опрос
          if (this.conflictErrorCount >= this.MAX_CONFLICT_ERRORS) {
            this.logger.warn('Множественные конфликты обнаружены. Прослушивание Telegram отключено. Убедитесь, что запущен только один экземпляр приложения.');
            this.isRunning = false;
            return;
          }
          
          // Ждем дольше перед следующей попыткой при конфликте
          if (this.isRunning) {
            this.pollingInterval = setTimeout(() => this.getUpdates(), 10000); // 10 секунд вместо 1
          }
          return;
        }
        
        // Сбрасываем счетчик конфликтов при других ошибках
        this.conflictErrorCount = 0;
        this.logger.error(`Ошибка API (код ${response.error_code}):`, response.description);
      } else {
        // Успешный ответ без обновлений - сбрасываем счетчик конфликтов
        this.conflictErrorCount = 0;
      }
    } catch (error) {
      this.logger.error('Ошибка при получении обновлений:', error);
    }

    // Продолжаем опрос
    if (this.isRunning) {
      this.pollingInterval = setTimeout(() => this.getUpdates(), 1000);
    }
  }

  private startPolling() {
    this.getUpdates();
  }

  /**
   * Отправляет сообщение в Telegram группу
   * @param chatId ID группы в Telegram (можно получить из переменной окружения TELEGRAM_GROUP_ID)
   * @param text Текст сообщения
   */
  async sendMessageToGroup(chatId: string, text: string): Promise<boolean> {
    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN не установлен. Невозможно отправить сообщение.');
      return false;
    }

    try {
      const encodedText = encodeURIComponent(text);
      const url = `${this.apiUrl}/sendMessage?chat_id=${chatId}&text=${encodedText}&parse_mode=HTML`;
      const response = await this.makeRequest(url);

      if (response.ok) {
        this.logger.debug('Сообщение успешно отправлено в Telegram группу');
        return true;
      } else {
        this.logger.error(`Ошибка при отправке сообщения в Telegram: ${response.description}`);
        return false;
      }
    } catch (error) {
      this.logger.error('Ошибка при отправке сообщения в Telegram:', error);
      return false;
    }
  }

  /**
   * Отправляет сообщение из чата сайта в Telegram группу
   * @param username Имя пользователя
   * @param message Текст сообщения
   * @param chatNumber Номер чата (ID сессии)
   * @param phone Телефон (опционально)
   */
  async sendChatMessageToTelegram(username: string, message: string, chatNumber: number, phone?: string): Promise<void> {
    const groupId = this.configService.get<string>('TELEGRAM_GROUP_ID') || 
                    process.env.TELEGRAM_GROUP_ID || 
                    '';

    if (!groupId) {
      this.logger.warn('TELEGRAM_GROUP_ID не установлен. Сообщение не будет отправлено в Telegram.');
      return;
    }

    // Формируем имя пользователя с номером чата
    const displayName = username === 'Гость' ? `Гость #${chatNumber}` : `${username} #${chatNumber}`;

    let text = `<b>💬 Новое сообщение из чата сайта</b>\n\n`;
    text += `<b>Пользователь:</b> ${this.escapeHtml(displayName)}\n`;
    if (phone) {
      text += `<b>Телефон:</b> ${this.escapeHtml(phone)}\n`;
    }
    text += `<b>Сообщение:</b>\n${this.escapeHtml(message)}`;

    await this.sendMessageToGroup(groupId, text);
  }

  /**
   * Отправляет форму обратной связи в Telegram группу
   * @param name Имя пользователя
   * @param phone Телефон (опционально)
   * @param email Email (опционально)
   * @param message Сообщение (опционально)
   */
  async sendContactFormToTelegram(name: string, phone?: string, email?: string, message?: string): Promise<void> {
    const groupId = this.configService.get<string>('TELEGRAM_GROUP_ID') || 
                    process.env.TELEGRAM_GROUP_ID || 
                    '';

    if (!groupId) {
      this.logger.warn('TELEGRAM_GROUP_ID не установлен. Сообщение не будет отправлено в Telegram.');
      return;
    }

    let text = `<b>📝 Обратная связь</b>\n\n`;
    
    if (name) {
      text += `<b>Имя:</b> ${this.escapeHtml(name)}\n`;
    }
    
    if (phone) {
      text += `<b>Телефон:</b> ${this.escapeHtml(phone)}\n`;
    }
    
    if (email) {
      text += `<b>Email:</b> ${this.escapeHtml(email)}\n`;
    }
    
    if (message) {
      text += `\n<b>Сообщение:</b>\n${this.escapeHtml(message)}`;
    }

    await this.sendMessageToGroup(groupId, text);
  }

  /**
   * Отправляет запрос на звонок в Telegram группу
   * @param phone Телефон клиента
   */
  async sendCallbackRequestToTelegram(phone: string): Promise<void> {
    const groupId = this.configService.get<string>('TELEGRAM_GROUP_ID') || 
                    process.env.TELEGRAM_GROUP_ID || 
                    '';
    
    if (!groupId) {
      this.logger.warn('TELEGRAM_GROUP_ID не установлен. Запрос на звонок не будет отправлен в Telegram.');
      return;
    }
    
    const text = `<b>📞 Запрос на звонок</b>\n\n` +
                 `<b>Телефон:</b> ${this.escapeHtml(phone)}\n` +
                 `<b>Время:</b> ${new Date().toLocaleString('ru-RU')}`;
    
    await this.sendMessageToGroup(groupId, text);
  }

  /**
   * Отправляет запрос на рассрочку в Telegram группу
   * @param phone Телефон клиента
   * @param productName Название товара (опционально)
   * @param productPrice Цена товара (опционально)
   */
  async sendInstallmentRequestToTelegram(phone: string, productName?: string, productPrice?: number): Promise<void> {
    const groupId = this.configService.get<string>('TELEGRAM_GROUP_ID') || 
                    process.env.TELEGRAM_GROUP_ID || 
                    '';
    
    if (!groupId) {
      this.logger.warn('TELEGRAM_GROUP_ID не установлен. Запрос на рассрочку не будет отправлен в Telegram.');
      return;
    }
    
    let text = `<b>💳 Запрос на рассрочку</b>\n\n` +
               `<b>Телефон:</b> ${this.escapeHtml(phone)}\n`;
    
    if (productName) {
      text += `<b>Товар:</b> ${this.escapeHtml(productName)}\n`;
    }
    
    if (productPrice) {
      text += `<b>Цена:</b> ${productPrice.toLocaleString('ru-RU')} ₽\n`;
    }
    
    text += `<b>Время:</b> ${new Date().toLocaleString('ru-RU')}`;
    
    await this.sendMessageToGroup(groupId, text);
  }

  /**
   * Отправляет запрос о наличии товара в Telegram группу
   * @param phone Телефон клиента
   * @param productId ID товара
   * @param productName Название товара (опционально)
   */
  async sendAvailabilityRequestToTelegram(phone: string, productId: number, productName?: string): Promise<void> {
    const groupId = this.configService.get<string>('TELEGRAM_GROUP_ID') || 
                    process.env.TELEGRAM_GROUP_ID || 
                    '';
    
    if (!groupId) {
      this.logger.warn('TELEGRAM_GROUP_ID не установлен. Запрос о наличии не будет отправлен в Telegram.');
      return;
    }
    
    let text = `<b>📦 Уточнить о наличии</b>\n\n` +
               `<b>Телефон:</b> ${this.escapeHtml(phone)}\n`;
    
    if (productId) {
      text += `<b>ID товара:</b> ${productId}\n`;
    }
    
    if (productName) {
      text += `<b>Товар:</b> ${this.escapeHtml(productName)}\n`;
    }
    
    text += `<b>Время:</b> ${new Date().toLocaleString('ru-RU')}`;
    
    await this.sendMessageToGroup(groupId, text);
  }

  /**
   * Отправляет информацию о заказе в Telegram группу
   * @param phone Телефон клиента
   * @param items Массив товаров в заказе
   * @param total Общая сумма заказа
   */
  async sendOrderToTelegram(phone: string, items: Array<{ name: string; quantity: number; price: number }>, total: number): Promise<void> {
    const groupId = this.configService.get<string>('TELEGRAM_GROUP_ID') || 
                    process.env.TELEGRAM_GROUP_ID || 
                    '';

    if (!groupId) {
      this.logger.warn('TELEGRAM_GROUP_ID не установлен. Заказ не будет отправлен в Telegram.');
      return;
    }

    let text = `<b>🛒 Новый заказ</b>\n\n`;
    text += `<b>Телефон:</b> ${this.escapeHtml(phone)}\n\n`;
    text += `<b>Товары:</b>\n`;
    
    items.forEach((item, index) => {
      text += `${index + 1}. ${this.escapeHtml(item.name)}\n`;
      text += `   Количество: ${item.quantity}\n`;
      text += `   Цена: ${item.price} ₽\n`;
      text += `   Сумма: ${item.quantity * item.price} ₽\n\n`;
    });
    
    text += `<b>Итого: ${total} ₽</b>`;

    await this.sendMessageToGroup(groupId, text);
  }

  /**
   * Скачивает фото из Telegram и загружает в хранилище
   * @param photos Массив фото из сообщения Telegram
   * @returns Ключ файла в хранилище или null при ошибке
   */
  private async downloadPhoto(photos: TelegramPhoto[]): Promise<string | null> {
    if (!photos || photos.length === 0) {
      return null;
    }

    try {
      // Берем самое большое фото (последнее в массиве)
      const largestPhoto = photos[photos.length - 1];
      const fileId = largestPhoto.file_id;

      // Получаем информацию о файле
      const fileInfoUrl = `${this.apiUrl}/getFile?file_id=${fileId}`;
      const fileInfo = await this.makeRequest(fileInfoUrl);

      if (!fileInfo.ok || !fileInfo.result) {
        this.logger.error('Не удалось получить информацию о файле');
        return null;
      }

      const filePath = fileInfo.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;

      // Скачиваем файл
      const fileBuffer = await this.downloadFile(fileUrl);

      // Определяем тип файла и папку
      const extension = filePath.split('.').pop() || 'jpg';
      const folder = 'products'; // Можно сделать динамическим

      // Загружаем в хранилище через StorageService
      // Нужно импортировать StorageService
      return await this.uploadPhotoToStorage(fileBuffer, extension, folder);
    } catch (error) {
      this.logger.error('Ошибка при скачивании фото:', error);
      return null;
    }
  }

  /**
   * Скачивает файл по URL
   */
  private downloadFile(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download file: ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Загружает фото в хранилище
   */
  private async uploadPhotoToStorage(buffer: Buffer, extension: string, folder: string): Promise<string> {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileName = `${folder}/${timestamp}-${randomString}.${extension}`;

    // Создаем объект файла в формате Express.Multer.File
    const file: Express.Multer.File = {
      fieldname: 'photo',
      originalname: `photo.${extension}`,
      encoding: '7bit',
      mimetype: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
      buffer: buffer,
      size: buffer.length,
      destination: '',
      filename: fileName,
      path: '',
      stream: Readable.from(buffer),
    };

    // Используем StorageService для загрузки
    return await this.storageService.uploadFile(file, folder);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}


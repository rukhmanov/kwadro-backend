import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';

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

  constructor(private configService: ConfigService) {
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

    try {
      const botInfo = await this.makeRequest(`${this.apiUrl}/getMe`);
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

  private makeRequest(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
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
      }).on('error', (error) => {
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
            const chatName = msg.chat.title || msg.chat.username || `Chat ${msg.chat.id}`;
            const userName = msg.from
              ? `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() || 
                msg.from.username || 
                `User ${msg.from.id}`
              : 'Unknown';
            const text = msg.text || '[не текстовое сообщение]';

            // Выводим только сообщения из групп и супергрупп
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
        }
        this.logger.error(`Ошибка API (код ${response.error_code}):`, response.description);
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

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}


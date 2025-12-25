import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactRequest } from '../entities/contact-request.entity';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(ContactRequest)
    private contactRequestsRepository: Repository<ContactRequest>,
    private telegramService: TelegramService,
  ) {}

  async create(contactRequest: Partial<ContactRequest>): Promise<ContactRequest> {
    const newRequest = this.contactRequestsRepository.create(contactRequest);
    const savedRequest = await this.contactRequestsRepository.save(newRequest);
    
    // Отправляем сообщение в Telegram группу
    await this.sendContactFormToTelegram(savedRequest);
    
    return savedRequest;
  }

  private async sendContactFormToTelegram(contactRequest: ContactRequest): Promise<void> {
    try {
      await this.telegramService.sendContactFormToTelegram(
        contactRequest.name,
        contactRequest.phone || undefined,
        contactRequest.email || undefined,
        contactRequest.message || undefined
      );
    } catch (error) {
      console.error('Ошибка при отправке формы обратной связи в Telegram:', error);
    }
  }

  findAll(): Promise<ContactRequest[]> {
    return this.contactRequestsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async requestCallback(phone: string): Promise<void> {
    // Отправляем запрос на звонок в Telegram
    await this.telegramService.sendCallbackRequestToTelegram(phone);
  }

  async requestInstallment(phone: string, productName?: string, productPrice?: number): Promise<void> {
    // Отправляем запрос на рассрочку в Telegram
    await this.telegramService.sendInstallmentRequestToTelegram(phone, productName, productPrice);
  }

  async requestAvailability(phone: string, productId: number, productName?: string): Promise<void> {
    // Отправляем запрос о наличии товара в Telegram
    await this.telegramService.sendAvailabilityRequestToTelegram(phone, productId, productName);
  }
}


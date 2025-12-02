import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from '../entities/chat-message.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private chatMessagesRepository: Repository<ChatMessage>,
  ) {}

  async findAll(): Promise<ChatMessage[]> {
    return this.chatMessagesRepository.find({
      order: { createdAt: 'ASC' },
      take: 50,
    });
  }

  async create(message: Partial<ChatMessage>): Promise<ChatMessage> {
    const newMessage = this.chatMessagesRepository.create(message);
    return this.chatMessagesRepository.save(newMessage);
  }
}


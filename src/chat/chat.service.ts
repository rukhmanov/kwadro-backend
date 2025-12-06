import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from '../entities/chat-message.entity';
import { ChatSession } from '../entities/chat-session.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private chatMessagesRepository: Repository<ChatMessage>,
    @InjectRepository(ChatSession)
    private chatSessionsRepository: Repository<ChatSession>,
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

  // Работа с сессиями
  async getOrCreateSession(sessionId: string): Promise<ChatSession> {
    let session = await this.chatSessionsRepository.findOne({
      where: { sessionId },
      relations: ['messages'],
    });

    if (!session) {
      session = this.chatSessionsRepository.create({
        sessionId,
        isActive: true,
        hasUnreadMessages: false,
      });
      session = await this.chatSessionsRepository.save(session);
    }

    return session;
  }

  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    const session = await this.chatSessionsRepository.findOne({
      where: { sessionId },
    });

    if (!session) {
      return [];
    }

    return this.chatMessagesRepository.find({
      where: { sessionId: session.id },
      order: { createdAt: 'ASC' },
    });
  }

  async createMessage(
    sessionId: string,
    messageData: { username: string; message: string; isAdmin?: boolean; phone?: string }
  ): Promise<ChatMessage> {
    const session = await this.getOrCreateSession(sessionId);
    
    // Обновляем сессию
    if (messageData.phone) {
      session.phone = messageData.phone;
    }
    
    if (!messageData.isAdmin) {
      session.hasUnreadMessages = true;
    } else {
      session.hasUnreadMessages = false;
    }
    
    session.isActive = true;
    await this.chatSessionsRepository.save(session);

    const message = this.chatMessagesRepository.create({
      ...messageData,
      sessionId: session.id,
      session,
    });

    const savedMessage = await this.chatMessagesRepository.save(message);
    return savedMessage;
  }

  async getAllSessions(): Promise<ChatSession[]> {
    const sessions = await this.chatSessionsRepository.find({
      relations: ['messages'],
      order: { updatedAt: 'DESC' },
    });
    
    // Фильтруем сессии, оставляя только те, у которых есть хотя бы одно сообщение
    return sessions.filter(session => session.messages && session.messages.length > 0);
  }

  async getSessionById(sessionId: string): Promise<ChatSession | null> {
    return this.chatSessionsRepository.findOne({
      where: { sessionId },
      relations: ['messages'],
    });
  }

  async markSessionAsRead(sessionId: string): Promise<void> {
    const session = await this.chatSessionsRepository.findOne({
      where: { sessionId },
    });

    if (session) {
      session.hasUnreadMessages = false;
      await this.chatSessionsRepository.save(session);
    }
  }

  async updateSessionPhone(sessionId: string, phone: string): Promise<void> {
    const session = await this.getOrCreateSession(sessionId);
    session.phone = phone;
    await this.chatSessionsRepository.save(session);
  }
}


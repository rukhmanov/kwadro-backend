import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ChatMessage } from './chat-message.entity';

@Entity('chat_sessions')
export class ChatSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { unique: true })
  sessionId: string; // Уникальный ID сессии (генерируется на фронтенде)

  @Column('varchar', { nullable: true })
  phone: string; // Номер телефона пользователя

  @Column({ default: false })
  hasUnreadMessages: boolean; // Есть ли непрочитанные сообщения от пользователя

  @Column({ default: false })
  isActive: boolean; // Активна ли сессия

  @OneToMany(() => ChatMessage, message => message.session)
  messages: ChatMessage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}



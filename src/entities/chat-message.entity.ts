import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { ChatSession } from './chat-session.entity';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar')
  username: string;

  @Column('text')
  message: string;

  @Column({ default: false })
  isAdmin: boolean;

  @Column('varchar', { nullable: true })
  phone: string; // Номер телефона пользователя (если указан)

  @ManyToOne(() => ChatSession, session => session.messages, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'sessionId' })
  session: ChatSession;

  @Column('int', { nullable: true })
  sessionId: number;

  @CreateDateColumn()
  createdAt: Date;
}


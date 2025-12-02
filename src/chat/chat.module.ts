import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatMessage } from '../entities/chat-message.entity';
import { ChatSession } from '../entities/chat-session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMessage, ChatSession])],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService],
})
export class ChatModule {}


import { Controller, Get, Param, Put, Body } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get('messages')
  findAll() {
    return this.chatService.findAll();
  }

  @Get('sessions')
  getAllSessions() {
    return this.chatService.getAllSessions();
  }

  @Get('sessions/:sessionId/messages')
  getSessionMessages(@Param('sessionId') sessionId: string) {
    return this.chatService.getSessionMessages(sessionId);
  }

  @Put('sessions/:sessionId/read')
  markAsRead(@Param('sessionId') sessionId: string) {
    return this.chatService.markSessionAsRead(sessionId);
  }
}


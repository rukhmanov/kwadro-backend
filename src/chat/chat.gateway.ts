import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private clientSessions = new Map<string, string>(); // client.id -> sessionId

  constructor(private chatService: ChatService) {}

  async handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.clientSessions.delete(client.id);
  }

  @SubscribeMessage('join-session')
  async handleJoinSession(client: Socket, payload: { sessionId: string }) {
    const { sessionId } = payload;
    this.clientSessions.set(client.id, sessionId);
    
    // Присоединяем клиента к комнате сессии
    client.join(`session:${sessionId}`);
    
    // Загружаем сообщения сессии
    const messages = await this.chatService.getSessionMessages(sessionId);
    client.emit('messages', messages);
  }

  @SubscribeMessage('message')
  async handleMessage(
    client: Socket,
    payload: { 
      sessionId: string; 
      username: string; 
      message: string; 
      isAdmin?: boolean;
      phone?: string;
    }
  ) {
    const { sessionId, username, message, isAdmin, phone } = payload;
    
    // Сохраняем сессию для клиента
    this.clientSessions.set(client.id, sessionId);
    client.join(`session:${sessionId}`);

    // Создаем сообщение
    const chatMessage = await this.chatService.createMessage(sessionId, {
      username,
      message,
      isAdmin: isAdmin || false,
      phone,
    });

    // Отправляем сообщение всем в этой сессии
    this.server.to(`session:${sessionId}`).emit('message', chatMessage);

    // Если это сообщение от пользователя (не админа), отправляем автоматический ответ
    if (!isAdmin) {
      // Уведомляем админов о новом сообщении
      const session = await this.chatService.getSessionById(sessionId);
      this.server.emit('new-chat-session', {
        sessionId,
        session,
        message: chatMessage,
      });

      // Автоматический ответ с задержкой
      setTimeout(async () => {
        const autoResponse = await this.chatService.createMessage(sessionId, {
          username: 'Менеджер',
          message: 'Оставьте, пожалуйста, номер телефона, на случай, если вы уйдете с сайта. Менеджер в ближайшее время подключится',
          isAdmin: true,
        });

        this.server.to(`session:${sessionId}`).emit('message', autoResponse);
        const session = await this.chatService.getSessionById(sessionId);
        this.server.emit('new-chat-session', {
          sessionId,
          session,
          message: autoResponse,
        });
      }, 3000); // 3 секунды задержки
    }
  }

  @SubscribeMessage('admin-message')
  async handleAdminMessage(
    client: Socket,
    payload: {
      sessionId: string;
      message: string;
    }
  ) {
    const { sessionId, message } = payload;

    const chatMessage = await this.chatService.createMessage(sessionId, {
      username: 'Администратор',
      message,
      isAdmin: true,
    });

    // Отправляем сообщение в сессию
    this.server.to(`session:${sessionId}`).emit('message', chatMessage);
    
    // Помечаем сессию как прочитанную
    await this.chatService.markSessionAsRead(sessionId);
  }
}


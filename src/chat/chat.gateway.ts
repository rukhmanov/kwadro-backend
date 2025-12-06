import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { TelegramService } from '../telegram/telegram.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private clientSessions = new Map<string, string>(); // client.id -> sessionId

  constructor(
    private chatService: ChatService,
    private telegramService: TelegramService,
  ) {}

  async handleConnection(client: Socket) {
  }

  handleDisconnect(client: Socket) {
    this.clientSessions.delete(client.id);
  }

  @SubscribeMessage('join-session')
  async handleJoinSession(client: Socket, payload: { sessionId: string }) {
    const { sessionId } = payload;
    this.clientSessions.set(client.id, sessionId);
    
    // Присоединяем клиента к комнате сессии
    client.join(`session:${sessionId}`);
    
    // Получаем существующую сессию (не создаем новую, если её нет)
    const session = await this.chatService.getSessionById(sessionId);
    
    // Загружаем сообщения сессии (если сессия существует)
    const messages = session ? await this.chatService.getSessionMessages(sessionId) : [];
    client.emit('messages', messages);
    
    // Отправляем номер чата клиенту только если сессия существует
    if (session) {
      client.emit('chat-number', { chatNumber: session.id });
    }
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

    // Создаем сообщение (сессия будет создана автоматически при создании первого сообщения)
    const chatMessage = await this.chatService.createMessage(sessionId, {
      username,
      message,
      isAdmin: isAdmin || false,
      phone,
    });

    // Получаем сессию после создания сообщения для получения номера чата
    const session = await this.chatService.getSessionById(sessionId);
    
    // Отправляем сообщение всем в этой сессии
    this.server.to(`session:${sessionId}`).emit('message', chatMessage);

    // Если это сообщение от пользователя (не админа), отправляем автоматический ответ
    if (!isAdmin && session) {
      // Вычисляем номер чата так же, как в админ панели (обратный порядок)
      const allSessions = await this.chatService.getAllSessions();
      const sessionIndex = allSessions.findIndex(s => s.id === session.id || s.sessionId === sessionId);
      const chatNumber = sessionIndex !== -1 ? allSessions.length - sessionIndex : session.id;
      
      // Отправляем сообщение в Telegram группу с номером чата
      this.telegramService.sendChatMessageToTelegram(username, message, chatNumber, phone).catch((error) => {
        console.error('Ошибка при отправке сообщения в Telegram:', error);
      });

      // Уведомляем админов о новом сообщении
      this.server.emit('new-chat-session', {
        sessionId,
        session,
        message: chatMessage,
      });

      // Проверяем, является ли это первым сообщением пользователя в сессии
      const existingMessages = await this.chatService.getSessionMessages(sessionId);
      const userMessages = existingMessages.filter(msg => !msg.isAdmin);
      
      // Отправляем автоматический ответ только если это первое сообщение пользователя
      if (userMessages.length === 1) {
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
    
    // Также отправляем сообщение отправителю (администратору), чтобы он видел его сразу
    client.emit('message', {
      ...chatMessage,
      sessionId: sessionId
    });
    
    // Помечаем сессию как прочитанную
    await this.chatService.markSessionAsRead(sessionId);
  }
}


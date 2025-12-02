import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { ContactRequest } from '../entities/contact-request.entity';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContactRequest]),
    TelegramModule,
  ],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}


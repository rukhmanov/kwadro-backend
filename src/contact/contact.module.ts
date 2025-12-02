import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { ContactRequest } from '../entities/contact-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ContactRequest])],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}


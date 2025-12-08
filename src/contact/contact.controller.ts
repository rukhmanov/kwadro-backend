import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactRequest } from '../entities/contact-request.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  create(@Body() contactRequest: Partial<ContactRequest>) {
    return this.contactService.create(contactRequest);
  }

  @Post('callback')
  requestCallback(@Body() body: { phone: string }) {
    return this.contactService.requestCallback(body.phone);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll() {
    return this.contactService.findAll();
  }
}





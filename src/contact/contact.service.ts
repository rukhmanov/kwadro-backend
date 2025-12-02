import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactRequest } from '../entities/contact-request.entity';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(ContactRequest)
    private contactRequestsRepository: Repository<ContactRequest>,
  ) {}

  create(contactRequest: Partial<ContactRequest>): Promise<ContactRequest> {
    const newRequest = this.contactRequestsRepository.create(contactRequest);
    return this.contactRequestsRepository.save(newRequest);
  }

  findAll(): Promise<ContactRequest[]> {
    return this.contactRequestsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }
}


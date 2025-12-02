import { Injectable, OnModuleInit } from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(private authService: AuthService) {}

  async onModuleInit() {
    await this.initializeAdmin();
  }

  async initializeAdmin() {
    const adminExists = await this.authService.findByUsername('admin');
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin', 10);
      await this.authService.createUser({
        username: 'admin',
        password: hashedPassword,
        isAdmin: true,
      });
      console.log('Admin user created: admin/admin');
    }
  }
}

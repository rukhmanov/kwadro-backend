import { Controller, Post, Body, UnauthorizedException, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: { username: string; password: string }) {
    const user = await this.authService.validateUser(loginDto.username, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Неверные учетные данные');
    }
    return this.authService.login(user);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Request() req: any, @Body() changePasswordDto: { oldPassword: string; newPassword: string }) {
    const userId = req.user.userId;
    await this.authService.changePassword(userId, changePasswordDto.oldPassword, changePasswordDto.newPassword);
    return { message: 'Пароль успешно изменен' };
  }
}





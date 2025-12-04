import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { CartService } from './cart.service';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  findAll(@Query('sessionId') sessionId: string) {
    return this.cartService.findAll(sessionId);
  }

  @Post('add')
  addItem(@Body() body: { sessionId: string; productId: number; quantity: number }) {
    return this.cartService.addItem(body.sessionId, body.productId, body.quantity);
  }

  @Patch(':id')
  updateQuantity(@Param('id') id: string, @Body() body: { quantity: number }) {
    return this.cartService.updateQuantity(+id, body.quantity);
  }

  @Delete(':id')
  removeItem(@Param('id') id: string) {
    return this.cartService.removeItem(+id);
  }

  @Delete()
  clearCart(@Query('sessionId') sessionId: string) {
    return this.cartService.clearCart(sessionId);
  }
}



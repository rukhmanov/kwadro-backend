import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CartItem } from '../entities/cart-item.entity';
import { Product } from '../entities/product.entity';
import { StorageService } from '../storage/storage.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItem)
    private cartItemsRepository: Repository<CartItem>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    private storageService: StorageService,
    private telegramService: TelegramService,
  ) {}

  private async transformProductImage(product: Product): Promise<void> {
    if (product.image) {
      const url = await this.storageService.getFileUrl(product.image);
      if (url) {
        product.image = url;
      }
    }
  }

  async findAll(sessionId: string): Promise<CartItem[]> {
    const cartItems = await this.cartItemsRepository.find({
      where: { sessionId },
      relations: ['product'],
    });

    // Преобразуем ключи изображений в подписанные URL
    for (const item of cartItems) {
      if (item.product) {
        await this.transformProductImage(item.product);
      }
    }

    return cartItems;
  }

  async addItem(sessionId: string, productId: number, quantity: number): Promise<CartItem> {
    const product = await this.productsRepository.findOne({ where: { id: productId } });
    if (!product) {
      throw new Error('Товар не найден');
    }

    let cartItem = await this.cartItemsRepository.findOne({
      where: { sessionId, productId },
    });

    if (cartItem) {
      cartItem.quantity += quantity;
      return this.cartItemsRepository.save(cartItem);
    } else {
      const newCartItem = this.cartItemsRepository.create({
        sessionId,
        productId,
        quantity,
      });
      return this.cartItemsRepository.save(newCartItem);
    }
  }

  async updateQuantity(id: number, quantity: number): Promise<CartItem> {
    const cartItem = await this.cartItemsRepository.findOne({ where: { id } });
    if (!cartItem) {
      throw new Error('Элемент корзины не найден');
    }
    cartItem.quantity = quantity;
    return this.cartItemsRepository.save(cartItem);
  }

  async removeItem(id: number): Promise<void> {
    await this.cartItemsRepository.delete(id);
  }

  async clearCart(sessionId: string): Promise<void> {
    await this.cartItemsRepository.delete({ sessionId });
  }

  async placeOrder(sessionId: string, phone: string): Promise<void> {
    const cartItems = await this.findAll(sessionId);
    
    if (cartItems.length === 0) {
      throw new Error('Корзина пуста');
    }

    // Формируем список товаров для Telegram
    const items = cartItems.map(item => ({
      name: item.product.name,
      quantity: item.quantity,
      price: item.product.price,
    }));

    // Вычисляем общую сумму
    const total = cartItems.reduce((sum, item) => {
      return sum + (item.product.price * item.quantity);
    }, 0);

    // Отправляем заказ в Telegram
    await this.telegramService.sendOrderToTelegram(phone, items, total);

    // Очищаем корзину после оформления заказа
    await this.clearCart(sessionId);
  }
}


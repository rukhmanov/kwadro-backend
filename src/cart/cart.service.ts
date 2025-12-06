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
    if (!product) return;
    
    // Обрабатываем изображения
    if (product.images && product.images.length > 0) {
      // Если есть массив images, преобразуем их в URL
      const urls = await Promise.all(
        product.images.map(img => this.storageService.getFileUrl(img))
      );
      product.images = urls.filter((url): url is string => url !== null);
      
      // Для обратной совместимости устанавливаем первое изображение как image
      if (product.images.length > 0) {
        product.image = product.images[0];
      }
    } else if (product.image) {
      // Если массив images пустой, но есть старое поле image, преобразуем его и добавляем в массив
      const imageUrl = await this.storageService.getFileUrl(product.image);
      if (imageUrl) {
        product.image = imageUrl;
        product.images = [imageUrl]; // Добавляем в массив для единообразия
      } else {
        // Если не удалось получить URL, очищаем поле
        product.image = null;
        product.images = [];
      }
    } else {
      // Если нет ни images, ни image, убеждаемся что массив пустой
      product.images = [];
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

    const currentQuantity = cartItem ? cartItem.quantity : 0;
    const newQuantity = currentQuantity + quantity;

    // Проверяем, не превышает ли новое количество stock товара
    if (newQuantity > product.stock) {
      throw new Error(`Недостаточно товара на складе. Доступно: ${product.stock} шт.`);
    }

    if (cartItem) {
      cartItem.quantity = newQuantity;
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
    const cartItem = await this.cartItemsRepository.findOne({ 
      where: { id },
      relations: ['product']
    });
    if (!cartItem) {
      throw new Error('Элемент корзины не найден');
    }

    // Проверяем, не превышает ли новое количество stock товара
    if (quantity > cartItem.product.stock) {
      throw new Error(`Недостаточно товара на складе. Доступно: ${cartItem.product.stock} шт.`);
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


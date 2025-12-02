import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CartItem } from '../entities/cart-item.entity';
import { Product } from '../entities/product.entity';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItem)
    private cartItemsRepository: Repository<CartItem>,
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
  ) {}

  async findAll(sessionId: string): Promise<CartItem[]> {
    return this.cartItemsRepository.find({
      where: { sessionId },
      relations: ['product'],
    });
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
}


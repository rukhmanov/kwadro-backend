import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './product.entity';

@Entity('product_specifications')
export class ProductSpecification {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Product, product => product.specifications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: number;

  @Column()
  name: string; // Название характеристики (например, "Двигатель", "Мощность")

  @Column('text')
  value: string; // Значение характеристики (например, "CGB250", "15 л.с.")

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}


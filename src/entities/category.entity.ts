import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Product } from './product.entity';
import { CategorySpecification } from './category-specification.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  image: string;

  @Column({ type: 'int', default: 0 })
  order: number;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];

  @OneToMany(() => CategorySpecification, (spec) => spec.category, { cascade: true })
  specifications: CategorySpecification[];
}


import { Entity, Column, PrimaryGeneratedColumn, ManyToMany, OneToMany } from 'typeorm';
import { Product } from './product.entity';
import { CategorySpecification } from './category-specification.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar')
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('varchar', { nullable: true })
  image: string;

  @Column({ type: 'int', default: 0 })
  order: number;

  @ManyToMany(() => Product, (product) => product.categories)
  products: Product[];

  @OneToMany(() => CategorySpecification, (spec) => spec.category, { cascade: true })
  specifications: CategorySpecification[];
}


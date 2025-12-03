import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('settings')
export class Settings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  key: string; // Например, 'background_image'

  @Column('text', { nullable: true })
  value: string | null; // URL или ключ изображения

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}


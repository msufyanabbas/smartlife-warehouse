import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ItemCondition {
  NEW = 'new',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
}

@Entity('inventory_items')
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ unique: true })
  sku: string;

  @Column({ nullable: true})
  schemeNo: string;

  @Column({nullable: true})
  projectName: string;

  @Column({ nullable: true })
  category: string;

  @Column({ nullable: true })
  brand: string;

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  serialNumber: string;

  @Column({ type: 'int', default: 0 })
  totalQuantity: number;

  @Column({ type: 'int', default: 0 })
  availableQuantity: number;

  @Column({ type: 'int', default: 0 })
  assignedQuantity: number;

  @Column({ type: 'int', default: 0 })
  usedQuantity: number;

  @Column({ type: 'enum', enum: ItemCondition, default: ItemCondition.NEW })
  condition: ItemCondition;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true })
  notes: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
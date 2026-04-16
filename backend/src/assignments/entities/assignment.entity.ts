import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';

export enum AssignmentStatus {
  ACTIVE = 'active',
  RETURNED = 'returned',
  TRANSFERRED = 'transferred',
}

@Entity('assignments')
export class Assignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'assignedToId' })
  assignedTo: User;

  @Column()
  assignedToId: string;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'assignedById' })
  assignedBy: User;

  @Column({ nullable: true })
  assignedById: string;

  @ManyToOne(() => InventoryItem, { eager: true })
  @JoinColumn({ name: 'itemId' })
  item: InventoryItem;

  @Column()
  itemId: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'enum', enum: AssignmentStatus, default: AssignmentStatus.ACTIVE })
  status: AssignmentStatus;

  @Column({ nullable: true })
  notes: string;

  @Column({ nullable: true })
  returnedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

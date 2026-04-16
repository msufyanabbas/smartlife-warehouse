import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';

export enum ItemRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

@Entity('item_requests')
export class ItemRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Worker who made the request
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'requestedById' })
  requestedBy: User;

  @Column()
  requestedById: string;

  // Item being requested
  @ManyToOne(() => InventoryItem, { eager: true })
  @JoinColumn({ name: 'itemId' })
  item: InventoryItem;

  @Column()
  itemId: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ nullable: true })
  reason: string;

  @Column({ type: 'enum', enum: ItemRequestStatus, default: ItemRequestStatus.PENDING })
  status: ItemRequestStatus;

  @Column({ nullable: true })
  rejectionReason: string;

  // Manager/Admin who reviewed
  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'reviewedById' })
  reviewedBy: User;

  @Column({ nullable: true })
  reviewedById: string;

  @Column({ nullable: true })
  reviewedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
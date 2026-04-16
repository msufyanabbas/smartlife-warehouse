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
import { Assignment } from '../../assignments/entities/assignment.entity';
import { TransferStatus } from '../../common/enums/transfer-status.enum';

@Entity('transfer_requests')
export class TransferRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The worker initiating the transfer (currently holds the items)
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'fromUserId' })
  fromUser: User;

  @Column()
  fromUserId: string;

  // The worker who will receive the items
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'toUserId' })
  toUser: User;

  @Column()
  toUserId: string;

  // The item being transferred
  @ManyToOne(() => InventoryItem, { eager: true })
  @JoinColumn({ name: 'itemId' })
  item: InventoryItem;

  @Column()
  itemId: string;

  // The source assignment (from worker's current holding)
  @ManyToOne(() => Assignment, { nullable: true })
  @JoinColumn({ name: 'sourceAssignmentId' })
  sourceAssignment: Assignment;

  @Column({ nullable: true })
  sourceAssignmentId: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'enum', enum: TransferStatus, default: TransferStatus.PENDING })
  status: TransferStatus;

  @Column({ nullable: true })
  reason: string;

  @Column({ nullable: true })
  rejectionReason: string;

  // Manager/Admin who reviewed the request
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

import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { Assignment } from '../../assignments/entities/assignment.entity';

export enum ReturnStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

@Entity('return_requests')
export class ReturnRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'requestedById' })
  requestedBy: User;

  @Column()
  requestedById: string;

  @ManyToOne(() => InventoryItem, { eager: true })
  @JoinColumn({ name: 'itemId' })
  item: InventoryItem;

  @Column()
  itemId: string;

  @ManyToOne(() => Assignment, { nullable: true })
  @JoinColumn({ name: 'assignmentId' })
  assignment: Assignment;

  @Column()
  assignmentId: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'enum', enum: ReturnStatus, default: ReturnStatus.PENDING })
  status: ReturnStatus;

  @Column({ nullable: true })
  notes: string;

  @Column({ nullable: true })
  rejectionReason: string;

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
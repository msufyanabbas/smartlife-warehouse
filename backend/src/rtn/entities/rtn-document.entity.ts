import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum RtnStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/**
 * What came back, per line — a single return can bring one unit back fit for the
 * shelf and another that failed on site.
 */
export enum RtnItemCondition {
  GOOD = 'Good',
  DAMAGED = 'Damaged',
  EXPIRED = 'Expired',
  OTHER = 'Other',
}

export interface RtnLineItem {
  itemCode: string;
  itemDescription: string;
  unit: string;
  qtyReturned: number;
  serialNumbers: string;
  condition: RtnItemCondition;
  /** Why it came back. Free text so a reason outside the usual list still fits. */
  reason: string;
  itemId?: string;
}

@Entity('rtn_documents')
export class RtnDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  rtnNo: string;

  @Column({ type: 'date', nullable: true })
  date: string;

  // The worker handing the stock back. Forced to the author on create when a
  // worker raises the form — they can only return what was booked out to them.
  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'returnedById' })
  returnedBy: User;

  @Column({ nullable: true })
  returnedById: string;

  // The storekeeper taking it in.
  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'receivedById' })
  receivedBy: User;

  @Column({ nullable: true })
  receivedById: string;

  @Column({ nullable: true })
  projectSite: string;

  @Column({ nullable: true })
  warehouseLocation: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'enum', enum: RtnStatus, default: RtnStatus.DRAFT })
  status: RtnStatus;

  // Manager/Admin who approved or rejected the return.
  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'approvedById' })
  approvedBy: User;

  @Column({ nullable: true })
  approvedById: string;

  @Column({ nullable: true })
  approvedAt: Date;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  items: RtnLineItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

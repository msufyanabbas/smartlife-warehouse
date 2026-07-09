import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum GrnCondition {
  GOOD = 'Good',
  DAMAGED = 'Damaged',
  PARTIAL = 'Partial',
  REJECTED = 'Rejected',
}

export enum GrnStatus {
  DRAFT = 'draft',
  COMPLETED = 'completed',
}

export interface GrnLineItem {
  itemCode: string;
  itemDescription: string;
  unit: string;
  orderedQty: number;
  receivedQty: number;
  serialNumber: string;
  productId?: string;
}

@Entity('grn_documents')
export class GrnDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  grnNo: string;

  @Column({ nullable: true })
  supplierName: string;

  @Column({ nullable: true })
  purchaseOrderNo: string;

  @Column({ type: 'date', nullable: true })
  dateOfReceipt: string;

  @Column({ nullable: true })
  deliveryNoteNo: string;

  @Column({ nullable: true })
  location: string;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'receivedById' })
  receivedBy: User;

  @Column({ nullable: true })
  receivedById: string;

  @Column({ nullable: true })
  projectName: string;

  @Column({ nullable: true })
  schemeNo: string;

  @Column({ type: 'enum', enum: GrnCondition, default: GrnCondition.GOOD })
  conditionOnArrival: GrnCondition;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'enum', enum: GrnStatus, default: GrnStatus.DRAFT })
  status: GrnStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  items: GrnLineItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

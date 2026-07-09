import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum TransferFormStatus {
  DRAFT = 'draft',
  APPROVED = 'approved',
  COMPLETED = 'completed',
}

export interface TransferFormLineItem {
  itemCode: string;
  itemDescription: string;
  unit: string;
  stockQty: number;
  qtyToTransfer: number;
  serialNumber: string;
  itemId?: string;
}

@Entity('transfer_forms')
export class TransferForm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  transferNo: string;

  @Column({ nullable: true })
  fromWarehouse: string;

  @Column({ nullable: true })
  fromProjectSite: string;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'issuedById' })
  issuedBy: User;

  @Column({ nullable: true })
  issuedById: string;

  @Column({ type: 'date', nullable: true })
  transferDate: string;

  @Column({ nullable: true })
  toWarehouse: string;

  @Column({ nullable: true })
  toProjectSite: string;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'receivedById' })
  receivedBy: User;

  @Column({ nullable: true })
  receivedById: string;

  @Column({ nullable: true })
  reasonForTransfer: string;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'approvedById' })
  approvedBy: User;

  @Column({ nullable: true })
  approvedById: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'enum', enum: TransferFormStatus, default: TransferFormStatus.DRAFT })
  status: TransferFormStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  items: TransferFormLineItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

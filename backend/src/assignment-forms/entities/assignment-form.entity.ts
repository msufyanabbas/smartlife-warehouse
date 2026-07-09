import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum AssignmentFormPriority {
  NORMAL = 'Normal',
  HIGH = 'High',
  URGENT = 'Urgent',
}

export enum AssignmentFormStatus {
  DRAFT = 'draft',
  APPROVED = 'approved',
  ISSUED = 'issued',
}

export interface AssignmentFormLineItem {
  itemCode: string;
  itemDescription: string;
  unit: string;
  stockAvailable: number;
  qtyRequested: number;
  qtyApproved: number;
  qtyIssued: number;
  serialNumber: string;
  itemId?: string;
}

@Entity('assignment_forms')
export class AssignmentForm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  assignmentNo: string;

  @Column({ type: 'date', nullable: true })
  date: string;

  @Column({ type: 'enum', enum: AssignmentFormPriority, default: AssignmentFormPriority.NORMAL })
  priority: AssignmentFormPriority;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'requestedById' })
  requestedBy: User;

  @Column({ nullable: true })
  requestedById: string;

  @Column({ nullable: true })
  department: string;

  @Column({ nullable: true })
  projectSite: string;

  @Column({ type: 'text', nullable: true })
  purposeDescription: string;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'assignedToId' })
  assignedTo: User;

  @Column({ nullable: true })
  assignedToId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'enum', enum: AssignmentFormStatus, default: AssignmentFormStatus.DRAFT })
  status: AssignmentFormStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  items: AssignmentFormLineItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

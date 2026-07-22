import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum MicStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/**
 * The outcome of an install is per line, not per document: one visit can leave
 * half a delivery fitted, one unit pending and one damaged in transit.
 */
export enum MicItemStatus {
  INSTALLED = 'Installed',
  PARTIAL = 'Partial',
  PENDING = 'Pending',
  DAMAGED = 'Damaged',
}

export interface MicLineItem {
  itemCode: string;
  itemDescription: string;
  unit: string;
  /** What the linked assignment booked out — carried over so the two can be compared. */
  qtyReceived: number;
  qtyInstalled: number;
  serialNumbers: string;
  /** Per line: a site visit can span days, so lines are not all fitted on the header date. */
  installDate: string;
  status: MicItemStatus;
  itemId?: string;
}

@Entity('mic_documents')
export class MicDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  micNo: string;

  /** The ASN whose items this confirms, held by reference rather than by id. */
  @Column({ nullable: true })
  assignmentNo: string;

  @Column({ type: 'date', nullable: true })
  date: string;

  /** One form covers one site, so the site is a header field, not a line field. */
  @Column({ nullable: true })
  siteId: string;

  @Column({ nullable: true })
  projectClient: string;

  @Column({ nullable: true })
  installDepartment: string;

  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'verifiedById' })
  verifiedBy: User;

  @Column({ nullable: true })
  verifiedById: string;

  @Column({ type: 'text', nullable: true })
  purposeDescription: string;

  // The worker who did the install. Stamped from the token on create, so it is
  // whoever opened the form rather than whatever the client claims.
  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: 'installedById' })
  installedBy: User;

  @Column({ nullable: true })
  installedById: string;

  @Column({ type: 'enum', enum: MicStatus, default: MicStatus.DRAFT })
  status: MicStatus;

  // Manager/Admin who approved or rejected the confirmation.
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
  items: MicLineItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

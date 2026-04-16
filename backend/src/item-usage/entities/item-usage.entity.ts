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

@Entity('item_usage')
export class ItemUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'workerUserId' })
  workerUser: User;

  @Column()
  workerUserId: string;

  @ManyToOne(() => InventoryItem, { eager: true })
  @JoinColumn({ name: 'itemId' })
  item: InventoryItem;

  @Column()
  itemId: string;

  @ManyToOne(() => Assignment, { nullable: true })
  @JoinColumn({ name: 'assignmentId' })
  assignment: Assignment;

  @Column({ nullable: true })
  assignmentId: string;

  @Column({ type: 'int' })
  quantityUsed: number;

  @Column()
  taskNo: string;

  @Column()
  projectName: string;

  @Column({ nullable: true })
  notes: string;

  @Column({ nullable: true })
  usedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
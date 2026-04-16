import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemUsage } from './entities/item-usage.entity';
import { Assignment, AssignmentStatus } from '../assignments/entities/assignment.entity';
import { InventoryService } from '../inventory/inventory.service';
import { CreateItemUsageDto } from './dto/item-usage.dto';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class ItemUsageService {
  constructor(
    @InjectRepository(ItemUsage)
    private usageRepository: Repository<ItemUsage>,
    @InjectRepository(Assignment)
    private assignmentRepository: Repository<Assignment>,
    private inventoryService: InventoryService,
  ) {}

  async findAll(currentUser: User) {
    const qb = this.usageRepository
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.workerUser', 'workerUser')
      .leftJoinAndSelect('u.item', 'item');

    if (currentUser.role === Role.WORKER) {
      qb.where('u.workerUserId = :uid', { uid: currentUser.id });
    }

    return qb.orderBy('u.createdAt', 'DESC').getMany();
  }

  async findByWorker(workerId: string) {
    return this.usageRepository.find({
      where: { workerUserId: workerId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByAssignment(assignmentId: string) {
    return this.usageRepository.find({
      where: { assignmentId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(dto: CreateItemUsageDto, currentUser: User) {
    const isManager = currentUser.role === Role.ADMIN || currentUser.role === Role.MANAGER;

    // Build assignment query — managers can log usage for any assignment
    const whereClause: any = {
      id: dto.assignmentId,
      itemId: dto.itemId,
      status: AssignmentStatus.ACTIVE,
    };

    // Workers can only log usage for their own assignments
    if (!isManager) {
      whereClause.assignedToId = currentUser.id;
    }

    const assignment = await this.assignmentRepository.findOne({ where: whereClause });

    if (!assignment) {
      throw new BadRequestException(
        isManager
          ? 'Assignment not found or is not active'
          : 'Assignment not found or you do not own it',
      );
    }

    if (dto.quantityUsed > assignment.quantity) {
      throw new BadRequestException(
        `Cannot log more than assigned quantity (${assignment.quantity})`,
      );
    }

    // Check total usage doesn't exceed assigned
    const existingUsage = await this.usageRepository
      .createQueryBuilder('u')
      .where('u.assignmentId = :aid', { aid: dto.assignmentId })
      .select('SUM(u.quantityUsed)', 'total')
      .getRawOne();

    const totalUsed = parseInt(existingUsage?.total || '0', 10);
    if (totalUsed + dto.quantityUsed > assignment.quantity) {
      throw new BadRequestException(
        `Total usage would exceed assigned quantity. Already logged: ${totalUsed}, assigned: ${assignment.quantity}`,
      );
    }

    // When manager logs on behalf of worker, record against the assigned worker
    const workerUserId = isManager ? assignment.assignedToId : currentUser.id;

    const usage = this.usageRepository.create({
      ...dto,
      workerUserId,
      usedAt: dto.usedAt ? new Date(dto.usedAt) : new Date(),
    });

    await this.usageRepository.save(usage);

    // Deduct used quantity from the assignment (items are consumed, no longer held)
    assignment.quantity -= dto.quantityUsed;
    if (assignment.quantity === 0) {
      assignment.status = AssignmentStatus.RETURNED; // fully consumed
    }
    await this.assignmentRepository.save(assignment);

    // Deduct from total stock (consumed items leave inventory entirely)
    await this.inventoryService.recordUsage(dto.itemId, dto.quantityUsed);

    return usage;
  }

  async remove(id: string, currentUser: User) {
    const usage = await this.usageRepository.findOne({ where: { id } });
    if (!usage) throw new NotFoundException('Usage record not found');

    if (
      currentUser.role === Role.WORKER &&
      usage.workerUserId !== currentUser.id
    ) {
      throw new ForbiddenException('Cannot delete another worker\'s usage record');
    }

    // Reverse the stock deduction
    await this.inventoryService.recordUsage(usage.itemId, -usage.quantityUsed);

    // Restore the assignment quantity
    const assignment = await this.assignmentRepository.findOne({
      where: { id: usage.assignmentId },
    });
    if (assignment) {
      assignment.quantity += usage.quantityUsed;
      // Reactivate if it was fully consumed
      if (assignment.status as any === 'returned' && assignment.quantity > 0) {
        assignment.status = AssignmentStatus.ACTIVE;
      }
      await this.assignmentRepository.save(assignment);
    }

    await this.usageRepository.remove(usage);
    return { message: 'Usage record deleted' };
  }

  async getStats(currentUser: User) {
    const qb = this.usageRepository
      .createQueryBuilder('u')
      .select('SUM(u.quantityUsed)', 'totalUsed')
      .addSelect('COUNT(u.id)', 'totalLogs');

    if (currentUser.role === Role.WORKER) {
      qb.where('u.workerUserId = :uid', { uid: currentUser.id });
    }

    return qb.getRawOne();
  }
}
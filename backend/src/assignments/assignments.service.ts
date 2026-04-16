import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Assignment, AssignmentStatus } from './entities/assignment.entity';
import { InventoryService } from '../inventory/inventory.service';
import { CreateAssignmentDto, ReturnAssignmentDto } from './dto/assignment.dto';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(Assignment)
    private assignmentRepository: Repository<Assignment>,
    private inventoryService: InventoryService,
  ) {}

  async findAll(currentUser: User) {
    const qb = this.assignmentRepository
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.assignedTo', 'assignedTo')
      .leftJoinAndSelect('a.assignedBy', 'assignedBy')
      .leftJoinAndSelect('a.item', 'item')
      .where('a.status = :status', { status: AssignmentStatus.ACTIVE });

    if (currentUser.role === Role.WORKER) {
      qb.andWhere('a.assignedToId = :userId', { userId: currentUser.id });
    }

    return qb.orderBy('a.createdAt', 'DESC').getMany();
  }

  async findOne(id: string) {
    const assignment = await this.assignmentRepository.findOne({ where: { id } });
    if (!assignment) throw new NotFoundException(`Assignment ${id} not found`);
    return assignment;
  }

  async findByWorker(workerId: string) {
    return this.assignmentRepository.find({
      where: { assignedToId: workerId, status: AssignmentStatus.ACTIVE },
      relations: ['item'],
      order: { createdAt: 'DESC' },
    });
  }

  async create(dto: CreateAssignmentDto, assignedBy: User) {
    const item = await this.inventoryService.findOne(dto.itemId);

    if (item.availableQuantity < dto.quantity) {
      throw new BadRequestException(
        `Only ${item.availableQuantity} units available, requested ${dto.quantity}`,
      );
    }

    const assignment = this.assignmentRepository.create({
      ...dto,
      assignedById: assignedBy.id,
      status: AssignmentStatus.ACTIVE,
    });

    await this.inventoryService.adjustQuantities(dto.itemId, dto.quantity, -dto.quantity);
    return this.assignmentRepository.save(assignment);
  }

  async returnItems(id: string, dto: ReturnAssignmentDto, currentUser: User) {
    const assignment = await this.findOne(id);

    if (assignment.status !== AssignmentStatus.ACTIVE) {
      throw new BadRequestException('Assignment is not active');
    }

    const isManager = currentUser.role === Role.ADMIN || currentUser.role === Role.MANAGER;

    // Workers can only return their own assignments
    if (!isManager && assignment.assignedToId !== currentUser.id) {
      throw new ForbiddenException('Cannot return items from another worker');
    }

    if (dto.quantity > assignment.quantity) {
      throw new BadRequestException(
        `Cannot return more than assigned quantity (${assignment.quantity})`,
      );
    }

    if (dto.quantity === assignment.quantity) {
      assignment.status = AssignmentStatus.RETURNED;
      assignment.returnedAt = new Date();
    } else {
      assignment.quantity -= dto.quantity;
    }

    if (dto.notes) assignment.notes = dto.notes;

    await this.inventoryService.adjustQuantities(
      assignment.itemId, -dto.quantity, dto.quantity,
    );
    return this.assignmentRepository.save(assignment);
  }

  // Used by workers to see their own assignments
  async getWorkerInventory(userId: string) {
    return this.assignmentRepository.find({
      where: { assignedToId: userId, status: AssignmentStatus.ACTIVE },
      relations: ['item'],
    });
  }

  // Used by managers/admins to see ALL active assignments (for transfer creation)
  async getAllActiveAssignments() {
    return this.assignmentRepository.find({
      where: { status: AssignmentStatus.ACTIVE },
      relations: ['item', 'assignedTo'],
      order: { createdAt: 'DESC' },
    });
  }
}
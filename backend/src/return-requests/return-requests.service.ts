import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReturnRequest, ReturnStatus } from './entities/return-request.entity';
import { Assignment, AssignmentStatus } from '../assignments/entities/assignment.entity';
import { InventoryService } from '../inventory/inventory.service';
import { CreateReturnRequestDto, ReviewReturnRequestDto } from './dto/request-return.dto';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class ReturnRequestsService {
  constructor(
    @InjectRepository(ReturnRequest)
    private returnRepository: Repository<ReturnRequest>,
    @InjectRepository(Assignment)
    private assignmentRepository: Repository<Assignment>,
    private inventoryService: InventoryService,
  ) {}

  async findAll(currentUser: User) {
    const qb = this.returnRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.requestedBy', 'requestedBy')
      .leftJoinAndSelect('r.item', 'item')
      .leftJoinAndSelect('r.reviewedBy', 'reviewedBy');

    if (currentUser.role === Role.WORKER) {
      qb.where('r.requestedById = :uid', { uid: currentUser.id });
    }

    return qb.orderBy('r.createdAt', 'DESC').getMany();
  }

  async findPending() {
    return this.returnRepository.find({
      where: { status: ReturnStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string) {
    const r = await this.returnRepository.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Return request ${id} not found`);
    return r;
  }

  async create(dto: CreateReturnRequestDto, currentUser: User) {
    const isManager = currentUser.role === Role.ADMIN || currentUser.role === Role.MANAGER;

    // Build where clause — managers can create return requests for any assignment
    const whereClause: any = {
      id: dto.assignmentId,
      itemId: dto.itemId,
      status: AssignmentStatus.ACTIVE,
    };

    // Workers can only return their own
    if (!isManager) {
      whereClause.assignedToId = currentUser.id;
    }

    const assignment = await this.assignmentRepository.findOne({ where: whereClause });

    if (!assignment) {
      throw new BadRequestException('Assignment not found or you do not have access to it');
    }

    if (dto.quantity > assignment.quantity) {
      throw new BadRequestException(
        `Cannot return more than assigned quantity (${assignment.quantity})`,
      );
    }

    // Prevent duplicate pending request for same assignment
    const existing = await this.returnRepository.findOne({
      where: { assignmentId: dto.assignmentId, status: ReturnStatus.PENDING },
    });
    if (existing) {
      throw new BadRequestException('A pending return request already exists for this assignment');
    }

    const request = this.returnRepository.create({
      ...dto,
      requestedById: currentUser.id,
      status: ReturnStatus.PENDING,
    });

    return this.returnRepository.save(request);
  }

  async review(id: string, dto: ReviewReturnRequestDto, reviewer: User) {
    const request = await this.findOne(id);

    if (request.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Return request is no longer pending');
    }

    request.reviewedById = reviewer.id;
    request.reviewedAt = new Date();

    if (dto.action === 'approve') {
      await this.executeReturn(request);
      request.status = ReturnStatus.APPROVED;
    } else {
      request.status = ReturnStatus.REJECTED;
      request.rejectionReason = dto.rejectionReason;
    }

    return this.returnRepository.save(request);
  }

  async cancel(id: string, currentUser: User) {
    const request = await this.findOne(id);

    if (request.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled');
    }

    const isManager = currentUser.role === Role.ADMIN || currentUser.role === Role.MANAGER;
    if (!isManager && request.requestedById !== currentUser.id) {
      throw new ForbiddenException('Cannot cancel another worker\'s return request');
    }

    request.status = ReturnStatus.CANCELLED;
    return this.returnRepository.save(request);
  }

  private async executeReturn(request: ReturnRequest) {
    const assignment = await this.assignmentRepository.findOne({
      where: { id: request.assignmentId, status: AssignmentStatus.ACTIVE },
    });

    if (!assignment) throw new BadRequestException('Assignment no longer active');

    if (request.quantity > assignment.quantity) {
      throw new BadRequestException('Return quantity exceeds current assignment quantity');
    }

    if (request.quantity === assignment.quantity) {
      assignment.status = AssignmentStatus.RETURNED;
      assignment.returnedAt = new Date();
    } else {
      assignment.quantity -= request.quantity;
    }

    await this.assignmentRepository.save(assignment);
    await this.inventoryService.adjustQuantities(
      request.itemId, -request.quantity, request.quantity,
    );
  }
}
import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemRequest, ItemRequestStatus } from './entities/item-request.entity';
import { Assignment, AssignmentStatus } from '../assignments/entities/assignment.entity';
import { InventoryService } from '../inventory/inventory.service';
import { CreateItemRequestDto, ReviewItemRequestDto } from './dto/item-request.dto';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class ItemRequestsService {
  constructor(
    @InjectRepository(ItemRequest)
    private requestRepository: Repository<ItemRequest>,
    @InjectRepository(Assignment)
    private assignmentRepository: Repository<Assignment>,
    private inventoryService: InventoryService,
  ) {}

  async findAll(currentUser: User) {
    const qb = this.requestRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.requestedBy', 'requestedBy')
      .leftJoinAndSelect('r.item', 'item')
      .leftJoinAndSelect('r.reviewedBy', 'reviewedBy');

    // Workers only see their own requests
    if (currentUser.role === Role.WORKER) {
      qb.where('r.requestedById = :uid', { uid: currentUser.id });
    }

    return qb.orderBy('r.createdAt', 'DESC').getMany();
  }

  async findPending() {
    return this.requestRepository.find({
      where: { status: ItemRequestStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string) {
    const r = await this.requestRepository.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Item request ${id} not found`);
    return r;
  }

  async create(dto: CreateItemRequestDto, currentUser: User) {
    const item = await this.inventoryService.findOne(dto.itemId);

    if (item.availableQuantity < dto.quantity) {
      throw new BadRequestException(
        `Only ${item.availableQuantity} units available, requested ${dto.quantity}`,
      );
    }

    // Prevent duplicate pending request for same item by same worker
    const existing = await this.requestRepository.findOne({
      where: {
        requestedById: currentUser.id,
        itemId: dto.itemId,
        status: ItemRequestStatus.PENDING,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'You already have a pending request for this item',
      );
    }

    const request = this.requestRepository.create({
      ...dto,
      requestedById: currentUser.id,
      status: ItemRequestStatus.PENDING,
    });

    return this.requestRepository.save(request);
  }

  async review(id: string, dto: ReviewItemRequestDto, reviewer: User) {
    const request = await this.findOne(id);

    if (request.status !== ItemRequestStatus.PENDING) {
      throw new BadRequestException('Request is no longer pending');
    }

    request.reviewedById = reviewer.id;
    request.reviewedAt = new Date();

    if (dto.action === 'approve') {
      await this.executeAssignment(request, reviewer);
      request.status = ItemRequestStatus.APPROVED;
    } else {
      request.status = ItemRequestStatus.REJECTED;
      request.rejectionReason = dto.rejectionReason;
    }

    return this.requestRepository.save(request);
  }

  async cancel(id: string, currentUser: User) {
    const request = await this.findOne(id);

    if (request.status !== ItemRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled');
    }

    if (
      currentUser.role === Role.WORKER &&
      request.requestedById !== currentUser.id
    ) {
      throw new ForbiddenException('Cannot cancel another worker\'s request');
    }

    request.status = ItemRequestStatus.CANCELLED;
    return this.requestRepository.save(request);
  }

  private async executeAssignment(request: ItemRequest, assignedBy: User) {
    // Re-check availability at approval time
    const item = await this.inventoryService.findOne(request.itemId);
    if (item.availableQuantity < request.quantity) {
      throw new BadRequestException(
        `Insufficient stock at approval time. Available: ${item.availableQuantity}, requested: ${request.quantity}`,
      );
    }

    // Find existing active assignment for this worker + item
    const existingAssignment = await this.assignmentRepository.findOne({
      where: {
        assignedToId: request.requestedById,
        itemId: request.itemId,
        status: AssignmentStatus.ACTIVE,
      },
    });

    if (existingAssignment) {
      // Top up existing assignment
      existingAssignment.quantity += request.quantity;
      await this.assignmentRepository.save(existingAssignment);
    } else {
      // Create new assignment
      const assignment = this.assignmentRepository.create({
        assignedToId: request.requestedById,
        itemId: request.itemId,
        quantity: request.quantity,
        assignedById: assignedBy.id,
        status: AssignmentStatus.ACTIVE,
        notes: `Auto-assigned from item request #${request.id.slice(0, 8)}`,
      });
      await this.assignmentRepository.save(assignment);
    }

    // Update inventory quantities
    await this.inventoryService.adjustQuantities(
      request.itemId,
      request.quantity,   // assigned increases
      -request.quantity,  // available decreases
    );
  }
}
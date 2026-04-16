import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransferRequest } from './entities/transfer-request.entity';
import { Assignment, AssignmentStatus } from '../assignments/entities/assignment.entity';
import { TransferStatus } from '../common/enums/transfer-status.enum';
import { InventoryService } from '../inventory/inventory.service';
import {
  CreateTransferRequestDto,
  ReviewTransferRequestDto,
} from './dto/transfer-request.dto';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class TransferRequestsService {
  constructor(
    @InjectRepository(TransferRequest)
    private transferRepository: Repository<TransferRequest>,
    @InjectRepository(Assignment)
    private assignmentRepository: Repository<Assignment>,
    private inventoryService: InventoryService,
  ) {}

  async findAll(currentUser: User) {
    const qb = this.transferRepository
      .createQueryBuilder('tr')
      .leftJoinAndSelect('tr.fromUser', 'fromUser')
      .leftJoinAndSelect('tr.toUser', 'toUser')
      .leftJoinAndSelect('tr.item', 'item')
      .leftJoinAndSelect('tr.reviewedBy', 'reviewedBy');

    if (currentUser.role === Role.WORKER) {
      qb.where(
        'tr.fromUserId = :uid OR tr.toUserId = :uid',
        { uid: currentUser.id },
      );
    }

    return qb.orderBy('tr.createdAt', 'DESC').getMany();
  }

  async findOne(id: string) {
    const tr = await this.transferRepository.findOne({ where: { id } });
    if (!tr) throw new NotFoundException(`Transfer request ${id} not found`);
    return tr;
  }

  async findPending() {
    return this.transferRepository.find({
      where: { status: TransferStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  async create(dto: CreateTransferRequestDto, fromUser: User) {
    const isManager = fromUser.role === Role.ADMIN || fromUser.role === Role.MANAGER;

    if (!isManager && dto.toUserId === fromUser.id) {
      throw new BadRequestException('Cannot transfer to yourself');
    }

    // Build where clause — managers can transfer from any worker's assignment
    const whereClause: any = {
      id: dto.sourceAssignmentId,
      itemId: dto.itemId,
      status: AssignmentStatus.ACTIVE,
    };

    // Workers can only transfer from their own assignments
    if (!isManager) {
      whereClause.assignedToId = fromUser.id;
    }

    const sourceAssignment = await this.assignmentRepository.findOne({
      where: whereClause,
    });

    if (!sourceAssignment) {
      throw new BadRequestException(
        'Source assignment not found or you do not have access to it',
      );
    }

    if (dto.quantity > sourceAssignment.quantity) {
      throw new BadRequestException(
        `Cannot transfer more than assigned quantity (${sourceAssignment.quantity})`,
      );
    }

    // Use the actual owner of the assignment as fromUserId for tracking
    const actualFromUserId = sourceAssignment.assignedToId;

    // Check no duplicate pending request
    const existing = await this.transferRepository.findOne({
      where: {
        fromUserId: actualFromUserId,
        itemId: dto.itemId,
        toUserId: dto.toUserId,
        status: TransferStatus.PENDING,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'A pending transfer request for this item already exists',
      );
    }

    const transfer = this.transferRepository.create({
      ...dto,
      fromUserId: actualFromUserId,
      status: TransferStatus.PENDING,
    });

    return this.transferRepository.save(transfer);
  }

  async review(id: string, dto: ReviewTransferRequestDto, reviewer: User) {
    const transfer = await this.findOne(id);

    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException('Transfer request is no longer pending');
    }

    transfer.reviewedById = reviewer.id;
    transfer.reviewedAt = new Date();

    if (dto.action === 'approve') {
      await this.executeTransfer(transfer);
      transfer.status = TransferStatus.APPROVED;
    } else {
      transfer.status = TransferStatus.REJECTED;
      transfer.rejectionReason = dto.rejectionReason;
    }

    return this.transferRepository.save(transfer);
  }

  async cancel(id: string, currentUser: User) {
    const transfer = await this.findOne(id);

    if (transfer.status !== TransferStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled');
    }

    const isManager = currentUser.role === Role.ADMIN || currentUser.role === Role.MANAGER;
    if (!isManager && transfer.fromUserId !== currentUser.id) {
      throw new ForbiddenException('Cannot cancel another worker\'s request');
    }

    transfer.status = TransferStatus.CANCELLED;
    return this.transferRepository.save(transfer);
  }

  private async executeTransfer(transfer: TransferRequest) {
    const sourceAssignment = await this.assignmentRepository.findOne({
      where: {
        id: transfer.sourceAssignmentId,
        assignedToId: transfer.fromUserId,
        itemId: transfer.itemId,
        status: AssignmentStatus.ACTIVE,
      },
    });

    if (!sourceAssignment) {
      throw new BadRequestException(
        'Source assignment no longer valid — items may have been returned',
      );
    }

    if (sourceAssignment.quantity < transfer.quantity) {
      throw new BadRequestException('Insufficient quantity in source assignment');
    }

    if (sourceAssignment.quantity === transfer.quantity) {
      sourceAssignment.status = AssignmentStatus.TRANSFERRED;
    } else {
      sourceAssignment.quantity -= transfer.quantity;
    }
    await this.assignmentRepository.save(sourceAssignment);

    const destAssignment = await this.assignmentRepository.findOne({
      where: {
        assignedToId: transfer.toUserId,
        itemId: transfer.itemId,
        status: AssignmentStatus.ACTIVE,
      },
    });

    if (destAssignment) {
      destAssignment.quantity += transfer.quantity;
      await this.assignmentRepository.save(destAssignment);
    } else {
      const newAssignment = this.assignmentRepository.create({
        assignedToId: transfer.toUserId,
        itemId: transfer.itemId,
        quantity: transfer.quantity,
        assignedById: transfer.fromUserId,
        status: AssignmentStatus.ACTIVE,
        notes: `Transferred via request #${transfer.id.slice(0, 8)}`,
      });
      await this.assignmentRepository.save(newAssignment);
    }
  }
}
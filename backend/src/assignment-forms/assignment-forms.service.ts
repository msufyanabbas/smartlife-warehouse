import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AssignmentForm,
  AssignmentFormLineItem,
  AssignmentFormStatus,
} from './entities/assignment-form.entity';
import {
  AssignmentFormItemDto,
  CreateAssignmentFormDto,
  UpdateAssignmentFormDto,
} from './dto/assignment-form.dto';
import { Assignment, AssignmentStatus } from '../assignments/entities/assignment.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { InventoryService } from '../inventory/inventory.service';
import { generateRefNumber } from '../common/utils/generate-ref-number';

@Injectable()
export class AssignmentFormsService {
  constructor(
    @InjectRepository(AssignmentForm)
    private formRepository: Repository<AssignmentForm>,
    @InjectRepository(Assignment)
    private assignmentRepository: Repository<Assignment>,
    @InjectRepository(InventoryItem)
    private inventoryRepository: Repository<InventoryItem>,
    private inventoryService: InventoryService,
  ) {}

  async findAll() {
    return this.formRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const doc = await this.formRepository.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`Assignment form ${id} not found`);
    return doc;
  }

  async create(dto: CreateAssignmentFormDto) {
    const assignmentNo = await generateRefNumber(this.formRepository, 'assignmentNo', 'ASN');
    const doc = this.formRepository.create({
      ...dto,
      assignmentNo,
      items: normalizeItems(dto.items),
    });

    const saved = await this.formRepository.save(doc);
    if (saved.status === AssignmentFormStatus.ISSUED) {
      await this.issueItems(saved);
    }
    return saved;
  }

  async update(id: string, dto: UpdateAssignmentFormDto) {
    const doc = await this.findOne(id);
    // Captured before the merge — inventory must be deducted exactly once, on
    // the transition into `issued`, not on every save of an already-issued form.
    const wasIssued = doc.status === AssignmentFormStatus.ISSUED;

    Object.assign(doc, dto);
    if (dto.items) doc.items = normalizeItems(dto.items);

    const saved = await this.formRepository.save(doc);
    if (!wasIssued && saved.status === AssignmentFormStatus.ISSUED) {
      await this.issueItems(saved);
    }
    return saved;
  }

  /**
   * Issuing a form is the primary way stock is assigned to a worker. For each
   * issued line it moves the quantity out of `available` and into `assigned`,
   * records an assignment linking the item to the recipient, and stamps the
   * form id on the inventory row so the assignment is traceable to its document.
   */
  private async issueItems(form: AssignmentForm) {
    for (const item of form.items) {
      if (!item.itemId || item.qtyIssued <= 0) continue;

      await this.inventoryService.adjustQuantities(
        item.itemId,
        item.qtyIssued,
        -item.qtyIssued,
      );

      // A recipient is required to open an assignment record; without one the
      // stock still moves into `assigned` but no per-worker record is created.
      if (form.assignedToId) {
        const assignment = this.assignmentRepository.create({
          itemId: item.itemId,
          assignedToId: form.assignedToId,
          assignedById: form.requestedById || undefined,
          quantity: item.qtyIssued,
          status: AssignmentStatus.ACTIVE,
          notes: `Issued via assignment form ${form.assignmentNo}`,
        });
        await this.assignmentRepository.save(assignment);
      }

      await this.inventoryRepository.update(item.itemId, { assignmentFormId: form.id });
    }
  }
}

function normalizeItems(items?: AssignmentFormItemDto[]): AssignmentFormLineItem[] {
  return (items ?? [])
    .filter(i => i.itemCode?.trim() || i.itemDescription?.trim())
    .map(i => ({
      itemCode: i.itemCode ?? '',
      itemDescription: i.itemDescription ?? '',
      unit: i.unit ?? '',
      stockAvailable: i.stockAvailable ?? 0,
      qtyRequested: i.qtyRequested ?? 0,
      qtyApproved: i.qtyApproved ?? 0,
      qtyIssued: i.qtyIssued ?? 0,
      serialNumber: i.serialNumber ?? '',
      itemId: i.itemId,
    }));
}

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
import { InventoryService } from '../inventory/inventory.service';
import { generateRefNumber } from '../common/utils/generate-ref-number';

@Injectable()
export class AssignmentFormsService {
  constructor(
    @InjectRepository(AssignmentForm)
    private formRepository: Repository<AssignmentForm>,
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
      await this.deductInventory(saved.items);
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
      await this.deductInventory(saved.items);
    }
    return saved;
  }

  /** Moves issued quantities out of `available` and into `assigned`. */
  private async deductInventory(items: AssignmentFormLineItem[]) {
    for (const item of items) {
      if (!item.itemId || item.qtyIssued <= 0) continue;
      await this.inventoryService.adjustQuantities(
        item.itemId,
        item.qtyIssued,
        -item.qtyIssued,
      );
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

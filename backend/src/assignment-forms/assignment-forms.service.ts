import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { joinSerials } from '../common/utils/serial-numbers';

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

    if (doc.status === AssignmentFormStatus.ISSUED) assertIssuable(doc);

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

    // Checked before the save: a form that persists as `issued` without opening
    // any assignment is the thing that makes the stock report read zero.
    if (!wasIssued && doc.status === AssignmentFormStatus.ISSUED) assertIssuable(doc);

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
   *
   * The assignment rows are what the stock report reads back — it reconstructs
   * what was out with workers on a given date from their timestamps — so every
   * issued line must open one. `assertIssuable` rejects the form up front rather
   * than letting a line be skipped here and go missing from the report.
   */
  private async issueItems(form: AssignmentForm) {
    for (const item of form.items) {
      if (!item.itemId || item.qtyIssued <= 0) continue;

      await this.inventoryService.adjustQuantities(
        item.itemId,
        item.qtyIssued,
        -item.qtyIssued,
      );

      const assignment = this.assignmentRepository.create({
        itemId: item.itemId,
        assignedToId: form.assignedToId,
        assignedById: form.requestedById || undefined,
        quantity: item.qtyIssued,
        status: AssignmentStatus.ACTIVE,
        notes: `ASN: ${form.assignmentNo}`,
        assignmentFormId: form.id,
      });
      await this.assignmentRepository.save(assignment);

      await this.inventoryRepository.update(item.itemId, { assignmentFormId: form.id });
    }
  }
}

/**
 * Issuing has to move stock *and* leave an assignment behind it. Each of these
 * would otherwise be a silent no-op — the form saves as `issued` while nothing
 * reaches inventory or the assignments table — so they are rejected instead.
 */
function assertIssuable(form: AssignmentForm) {
  if (!form.assignedToId) {
    throw new BadRequestException(
      'Select who the items are assigned to before issuing — issued stock has to be booked out to a recipient.',
    );
  }

  const issuedLines = (form.items ?? []).filter(item => (item.qtyIssued ?? 0) > 0);
  if (!issuedLines.length) {
    throw new BadRequestException('Enter a Qty Issued on at least one line before issuing.');
  }

  const unlinked = issuedLines.filter(item => !item.itemId);
  if (unlinked.length) {
    const codes = unlinked.map(item => item.itemCode || item.itemDescription).join(', ');
    throw new BadRequestException(
      `No stock item is linked to ${codes} — pick the item from the Item Code dropdown so the quantity can be taken out of inventory.`,
    );
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
      serialNumber: joinSerials(i.serialNumber),
      itemId: i.itemId,
    }));
}

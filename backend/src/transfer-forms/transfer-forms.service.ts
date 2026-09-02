import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TransferForm, TransferFormLineItem, TransferFormStatus,
} from './entities/transfer-form.entity';
import {
  CreateTransferFormDto,
  TransferFormItemDto,
  UpdateTransferFormDto,
} from './dto/transfer-form.dto';
import { Assignment, AssignmentStatus } from '../assignments/entities/assignment.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';
import { generateRefNumber } from '../common/utils/generate-ref-number';
import { joinSerials } from '../common/utils/serial-numbers';

@Injectable()
export class TransferFormsService {
  constructor(
    @InjectRepository(TransferForm)
    private formRepository: Repository<TransferForm>,
    @InjectRepository(InventoryItem)
    private inventoryRepository: Repository<InventoryItem>,
    @InjectRepository(Assignment)
    private assignmentRepository: Repository<Assignment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findAll() {
    return this.formRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const doc = await this.formRepository.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`Transfer form ${id} not found`);
    return doc;
  }

  async create(dto: CreateTransferFormDto) {
    const transferNo = await generateRefNumber(this.formRepository, 'transferNo', 'TRF');
    const doc = this.formRepository.create({
      ...dto,
      transferNo,
      items: normalizeItems(dto.items),
    });
    const saved = await this.formRepository.save(doc);
    if (saved.status === TransferFormStatus.COMPLETED) {
      await this.applyTransfer(saved);
    }
    return saved;
  }

  async update(id: string, dto: UpdateTransferFormDto) {
    const doc = await this.findOne(id);
    // Captured before the merge — the inventory move must run exactly once, on
    // the transition into `completed`, not on every save of a completed form.
    const wasCompleted = doc.status === TransferFormStatus.COMPLETED;
    // Captured before the merge so we can tell which of the three people named
    // on the document actually changed.
    const prevIssuedById = doc.issuedById;
    const prevReceivedById = doc.receivedById;
    const prevApprovedById = doc.approvedById;

    Object.assign(doc, dto);
    if (dto.items) doc.items = normalizeItems(dto.items);

    // `issuedBy`/`receivedBy`/`approvedBy` are eager relations, so `doc` was
    // loaded with the old User objects attached. Object.assign only touched the
    // FK columns; on save TypeORM derives each FK from the still-attached
    // relation object and silently writes the old id back — which is exactly why
    // re-pointing a transfer at a different person never stuck. Re-point the
    // relation at the new id (or clear it) so the FK we were asked to persist is
    // the one that survives the save. The same fix the assignment form and the
    // return document already carry.
    if (doc.issuedById !== prevIssuedById) {
      doc.issuedBy = (doc.issuedById ? { id: doc.issuedById } : null) as User;
    }
    if (doc.receivedById !== prevReceivedById) {
      doc.receivedBy = (doc.receivedById ? { id: doc.receivedById } : null) as User;
    }
    if (doc.approvedById !== prevApprovedById) {
      doc.approvedBy = (doc.approvedById ? { id: doc.approvedById } : null) as User;
    }

    const saved = await this.formRepository.save(doc);
    if (!wasCompleted && saved.status === TransferFormStatus.COMPLETED) {
      await this.applyTransfer(saved);
    }
    return saved;
  }

  /**
   * Completing a form is the primary way stock changes location. Each line's
   * inventory row is re-homed to the destination project/warehouse and stamped
   * with the form id, and — when the stock is coming off a worker — the quantity
   * moves out of `assigned` too.
   *
   * Who is issuing decides whether any quantity moves at all. A manager or
   * storekeeper transfers warehouse stock between sites: nothing was ever booked
   * out to a person, so only the location changes. A worker transfers what was
   * assigned to them, which either goes back on the shelf (assigned → available)
   * or straight to another worker (assigned unchanged, holder re-pointed).
   */
  private async applyTransfer(form: TransferForm) {
    const issuerIsWorker = await this.isWorker(form.issuedById);
    // Only meaningful when a worker is issuing — a "Received By" storekeeper on a
    // warehouse-to-warehouse transfer is a signature, not a new holder.
    const receiverIsWorker = issuerIsWorker && await this.isWorker(form.receivedById);

    for (const line of form.items ?? []) {
      if (!(line.qtyToTransfer > 0)) continue;

      const item = await this.findLineItem(line);
      if (!item) continue;

      // The destination site is keyed on schemeNo (what the stock report and the
      // transfer "from" filter group by); the warehouse maps to location.
      if (form.toProjectSite) item.schemeNo = form.toProjectSite;
      if (form.toWarehouse) item.location = form.toWarehouse;
      item.transferFormId = form.id;

      if (issuerIsWorker) {
        await this.releaseFromWorker(
          item.id,
          form.issuedById,
          line.qtyToTransfer,
          receiverIsWorker ? AssignmentStatus.TRANSFERRED : AssignmentStatus.RETURNED,
        );

        if (receiverIsWorker) {
          // Still out with a person, just a different one — the totals on the
          // inventory row are unchanged.
          await this.assignToWorker(item.id, form.receivedById, line.qtyToTransfer, form);
        } else {
          // Back on the shelf. Clamped to what is actually assigned so the
          // `total = available + assigned + used` invariant survives a line that
          // over-states its quantity.
          const moved = Math.min(line.qtyToTransfer, item.assignedQuantity);
          item.assignedQuantity -= moved;
          item.availableQuantity += moved;
        }
      }

      await this.inventoryRepository.save(item);
    }
  }

  /** Prefer the explicit inventory link; fall back to SKU at the origin. */
  private async findLineItem(line: TransferFormLineItem) {
    if (line.itemId) {
      const byId = await this.inventoryRepository.findOne({ where: { id: line.itemId } });
      if (byId) return byId;
    }

    const sku = line.itemCode?.trim();
    if (!sku) return null;

    return this.inventoryRepository.findOne({
      where: { sku },
      order: { createdAt: 'DESC' },
    });
  }

  private async isWorker(userId?: string) {
    if (!userId) return false;
    const user = await this.userRepository.findOne({ where: { id: userId } });
    return user?.role === Role.WORKER;
  }

  /**
   * Takes `qty` off the issuing worker's active assignments — the rows the stock
   * report reads back, so inventory moving without them would leave the item
   * showing as still held. Mirrors the return-request flow: an assignment the
   * transfer consumes entirely is closed, a partly consumed one is reduced.
   *
   * Oldest first, and it stops early if the assignments do not cover the line:
   * stock that predates these rows has none to spend.
   */
  private async releaseFromWorker(
    itemId: string,
    workerId: string,
    qty: number,
    closeAs: AssignmentStatus,
  ) {
    const rows = await this.assignmentRepository.find({
      where: { itemId, assignedToId: workerId, status: AssignmentStatus.ACTIVE },
      order: { createdAt: 'ASC' },
    });

    let remaining = qty;
    for (const row of rows) {
      if (remaining <= 0) break;

      const take = Math.min(remaining, row.quantity);
      if (take === row.quantity) {
        row.status = closeAs;
        // The report reconstructs holdings from timestamps, so a closed row needs
        // the date it stopped counting — whether it went back or moved on.
        row.returnedAt = new Date();
      } else {
        row.quantity -= take;
      }

      await this.assignmentRepository.save(row);
      remaining -= take;
    }
  }

  /** Opens the receiving worker's assignment. `TRF:` mirrors the ASN convention. */
  private async assignToWorker(itemId: string, workerId: string, qty: number, form: TransferForm) {
    const assignment = this.assignmentRepository.create({
      itemId,
      assignedToId: workerId,
      assignedById: form.approvedById || form.issuedById || undefined,
      quantity: qty,
      status: AssignmentStatus.ACTIVE,
      notes: `TRF: ${form.transferNo}`,
    });
    await this.assignmentRepository.save(assignment);
  }
}

function normalizeItems(items?: TransferFormItemDto[]): TransferFormLineItem[] {
  return (items ?? [])
    .filter(i => i.itemCode?.trim() || i.itemDescription?.trim())
    .map(i => ({
      itemCode: i.itemCode ?? '',
      itemDescription: i.itemDescription ?? '',
      unit: i.unit ?? '',
      stockQty: i.stockQty ?? 0,
      qtyToTransfer: i.qtyToTransfer ?? 0,
      serialNumber: joinSerials(i.serialNumber),
      itemId: i.itemId,
    }));
}

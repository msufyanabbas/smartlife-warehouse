import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RtnDocument, RtnItemCondition, RtnLineItem, RtnStatus,
} from './entities/rtn-document.entity';
import { CreateRtnDto, ReviewRtnDto, RtnItemDto, UpdateRtnDto } from './dto/rtn.dto';
import { Assignment, AssignmentStatus } from '../assignments/entities/assignment.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';
import { generateRefNumber } from '../common/utils/generate-ref-number';
import { joinSerials } from '../common/utils/serial-numbers';

/**
 * An RTN is the paper record of stock coming back off a worker. It is the mirror
 * of the assignment form: the ASN books quantity out of `available` and into
 * `assigned`, and approving the RTN moves it back the other way.
 *
 * The worker raises and submits it; a manager or admin approves or rejects it,
 * and only that approval moves stock. Both identities are taken from the token
 * rather than the request body, so neither can be claimed by a client.
 */
@Injectable()
export class RtnService {
  constructor(
    @InjectRepository(RtnDocument)
    private rtnRepository: Repository<RtnDocument>,
    @InjectRepository(InventoryItem)
    private inventoryRepository: Repository<InventoryItem>,
    @InjectRepository(Assignment)
    private assignmentRepository: Repository<Assignment>,
  ) {}

  async findAll() {
    return this.rtnRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findPending() {
    return this.rtnRepository.find({
      where: { status: RtnStatus.PENDING_APPROVAL },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string) {
    const doc = await this.rtnRepository.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`RTN ${id} not found`);
    return doc;
  }

  async create(dto: CreateRtnDto, author: User) {
    assertEditableStatus(dto.status);

    const rtnNo = await generateRefNumber(this.rtnRepository, 'rtnNo', 'RTN');
    const doc = this.rtnRepository.create({
      ...dto,
      rtnNo,
      // A worker can only hand back what was booked out to them, so the name on
      // the document is theirs whatever the client sent. A manager raising the
      // form on someone's behalf picks the worker from the dropdown.
      returnedById: author.role === Role.WORKER ? author.id : dto.returnedById,
      items: normalizeItems(dto.items),
    });

    const saved = await this.rtnRepository.save(doc);
    // Re-read so the eager `returnedBy` / `receivedBy` relations come back
    // populated — save() only echoes the ids it was handed.
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateRtnDto) {
    const doc = await this.findOne(id);
    assertEditableStatus(dto.status);

    // Once approved the stock has already gone back on the shelf; re-saving the
    // document must not be a way to move it twice.
    if (doc.status === RtnStatus.APPROVED) {
      throw new BadRequestException('This return has been approved and can no longer be edited.');
    }

    // Captured before the merge so we can tell whether the two people named on
    // the document actually changed.
    const prevReturnedById = doc.returnedById;
    const prevReceivedById = doc.receivedById;

    Object.assign(doc, dto);
    // `items` is a JSONB blob, so it is replaced wholesale rather than merged.
    if (dto.items) doc.items = normalizeItems(dto.items);

    // `returnedBy`/`receivedBy` are eager relations, so `doc` was loaded with the
    // old User objects attached. Object.assign only touched the FK columns; on save
    // TypeORM derives each FK from the still-attached relation object and silently
    // writes the old id back. Re-point the relation at the new id (or clear it) so
    // the FK we were asked to persist is the one that survives the save.
    if (doc.returnedById !== prevReturnedById) {
      doc.returnedBy = (doc.returnedById ? { id: doc.returnedById } : null) as User;
    }
    if (doc.receivedById !== prevReceivedById) {
      doc.receivedBy = (doc.receivedById ? { id: doc.receivedById } : null) as User;
    }

    // Re-submitting after a rejection starts the review over: leaving the old
    // verdict on the document would show a reviewer someone else's reason.
    if (doc.status === RtnStatus.PENDING_APPROVAL) {
      doc.approvedById = null;
      doc.approvedAt = null;
      doc.rejectionReason = null;
    }

    await this.rtnRepository.save(doc);
    return this.findOne(id);
  }

  async review(id: string, dto: ReviewRtnDto, reviewer: User) {
    const doc = await this.findOne(id);

    if (doc.status !== RtnStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only a return awaiting approval can be reviewed.');
    }

    const reason = dto.rejectionReason?.trim();
    if (dto.action === 'reject' && !reason) {
      throw new BadRequestException('Give a reason so the worker knows what to correct.');
    }

    doc.status = dto.action === 'approve' ? RtnStatus.APPROVED : RtnStatus.REJECTED;
    doc.approvedById = reviewer.id;
    doc.approvedAt = new Date();
    doc.rejectionReason = dto.action === 'reject' ? reason : null;

    await this.rtnRepository.save(doc);
    if (doc.status === RtnStatus.APPROVED) await this.applyReturn(doc);

    // Re-read so `approvedBy` comes back as the reviewer, not the stale relation.
    return this.findOne(id);
  }

  /**
   * Approving a return is the only thing on this document that moves stock, and
   * `review` is the only route into `approved`, so it runs exactly once.
   *
   * Each line's quantity comes off `assigned` and goes onto `available` — the
   * exact reverse of what issuing the assignment form did. The assignment rows
   * the ASN opened are closed alongside it: the Assignments page and a worker's
   * "my inventory" read those rows, so stock that moved without them would keep
   * showing as still out with the worker.
   */
  private async applyReturn(rtn: RtnDocument) {
    for (const line of rtn.items ?? []) {
      if (!(line.qtyReturned > 0)) continue;

      const item = await this.findLineItem(line);
      if (!item) continue;

      // Clamped at zero rather than at what the row says is assigned: rows that
      // predate the assigned/available bookkeeping carry a zero `assignedQuantity`
      // while the worker really is holding the stock, and refusing to reshelve it
      // would leave the return with nowhere to land.
      item.assignedQuantity = Math.max(0, item.assignedQuantity - line.qtyReturned);
      item.availableQuantity += line.qtyReturned;
      await this.inventoryRepository.save(item);

      if (rtn.returnedById) {
        await this.releaseFromWorker(item.id, rtn.returnedById, line.qtyReturned);
      }
    }
  }

  /** Prefer the explicit inventory link; fall back to the SKU the line names. */
  private async findLineItem(line: RtnLineItem) {
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

  /**
   * Takes `qty` off the returning worker's active assignments, oldest first —
   * the same bookkeeping a transfer off a worker does. An assignment the return
   * consumes entirely is closed; a partly consumed one is reduced. It stops
   * early if the assignments do not cover the line: stock that predates these
   * rows has none to spend.
   */
  private async releaseFromWorker(itemId: string, workerId: string, qty: number) {
    const rows = await this.assignmentRepository.find({
      where: { itemId, assignedToId: workerId, status: AssignmentStatus.ACTIVE },
      order: { createdAt: 'ASC' },
    });

    let remaining = qty;
    for (const row of rows) {
      if (remaining <= 0) break;

      const take = Math.min(remaining, row.quantity);
      if (take === row.quantity) {
        row.status = AssignmentStatus.RETURNED;
        // The report reconstructs holdings from timestamps, so a closed row needs
        // the date it stopped counting.
        row.returnedAt = new Date();
      } else {
        row.quantity -= take;
      }

      await this.assignmentRepository.save(row);
      remaining -= take;
    }
  }
}

/**
 * `approved` and `rejected` carry an approver and a timestamp, so they are only
 * ever reached through `review` — and `approved` is what moves stock. A create
 * or update that asks for one directly would leave the document claiming a
 * verdict nobody gave, and could reshelve the same quantity on every save.
 */
function assertEditableStatus(status?: RtnStatus) {
  if (status === RtnStatus.APPROVED || status === RtnStatus.REJECTED) {
    throw new BadRequestException(
      'Approving or rejecting a return is done from the review action, not by saving the form.',
    );
  }
}

/** Drops blank rows and fills the gaps a partially-typed row leaves behind. */
function normalizeItems(items?: RtnItemDto[]): RtnLineItem[] {
  return (items ?? [])
    .filter(i => i.itemCode?.trim() || i.itemDescription?.trim())
    .map(i => ({
      itemCode: i.itemCode ?? '',
      itemDescription: i.itemDescription ?? '',
      unit: i.unit ?? '',
      qtyReturned: i.qtyReturned ?? 0,
      serialNumbers: joinSerials(i.serialNumbers),
      condition: i.condition ?? RtnItemCondition.GOOD,
      reason: i.reason ?? '',
      itemId: i.itemId,
    }));
}

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
import { RtnDocument, RtnStatus } from '../rtn/entities/rtn-document.entity';
import { User } from '../users/entities/user.entity';
import { generateRefNumber } from '../common/utils/generate-ref-number';
import { joinSerials, serialKey, splitSerials } from '../common/utils/serial-numbers';

@Injectable()
export class AssignmentFormsService {
  constructor(
    @InjectRepository(AssignmentForm)
    private formRepository: Repository<AssignmentForm>,
    @InjectRepository(Assignment)
    private assignmentRepository: Repository<Assignment>,
    @InjectRepository(InventoryItem)
    private inventoryRepository: Repository<InventoryItem>,
    @InjectRepository(RtnDocument)
    private rtnRepository: Repository<RtnDocument>,
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

    if (doc.status === AssignmentFormStatus.ISSUED) {
      assertIssuable(doc);
      await this.assertSerialsAvailable(doc.items);
    }

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
    // Captured before the merge so we can tell whether the recipient actually
    // changed, and follow the correction through to the assignment rows below.
    const prevAssignedToId = doc.assignedToId;
    const prevRequestedById = doc.requestedById;

    Object.assign(doc, dto);
    if (dto.items) doc.items = normalizeItems(dto.items);

    // `assignedTo`/`requestedBy` are eager relations, so `doc` was loaded with the
    // old User objects attached. Object.assign only touched the FK columns; on save
    // TypeORM derives each FK from the still-attached relation object and silently
    // writes the old id back — which is exactly why changing the recipient on an
    // already-issued form never stuck. Re-point the relation at the new id (or clear
    // it) so the FK we were asked to persist is the one that survives the save.
    if (doc.assignedToId !== prevAssignedToId) {
      doc.assignedTo = (doc.assignedToId ? { id: doc.assignedToId } : null) as User;
    }
    if (doc.requestedById !== prevRequestedById) {
      doc.requestedBy = (doc.requestedById ? { id: doc.requestedById } : null) as User;
    }

    // Checked before the save: a form that persists as `issued` without opening
    // any assignment is the thing that makes the stock report read zero.
    if (!wasIssued && doc.status === AssignmentFormStatus.ISSUED) {
      assertIssuable(doc);
      await this.assertSerialsAvailable(doc.items, id);
    } else if (wasIssued && dto.items) {
      // An issued form stays editable, and rewriting its serials is the same
      // double-booking by another route — the units are already in someone's
      // hands, so the line cannot be re-pointed at a serial that is out.
      await this.assertSerialsAvailable(doc.items, id);
    }

    const saved = await this.formRepository.save(doc);
    if (!wasIssued && saved.status === AssignmentFormStatus.ISSUED) {
      await this.issueItems(saved);
    }

    // Correcting the recipient on an already-issued form has to follow through to
    // the assignment rows opened when it was issued: the Assigned & Used report
    // reads the recipient from those rows, not from the form, so leaving them on
    // the old worker would keep showing the mistake after the form itself is fixed.
    if (wasIssued && saved.assignedToId && saved.assignedToId !== prevAssignedToId) {
      await this.assignmentRepository.update(
        { assignmentFormId: id },
        { assignedToId: saved.assignedToId },
      );
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

  /**
   * A serial names one physical unit, so it can only be in one pair of hands at
   * a time: issuing it a second time while it is still out books the same unit
   * to two workers and leaves the Assigned & Used report double-counting it.
   *
   * What is still out is derived from the documents rather than the assignments
   * table, which records quantities per item and never the serials themselves.
   * Issuing a form puts its serials out; approving an RTN brings them back. The
   * two are netted as counts, not flags, because the same serial legitimately
   * goes out again after each return — and reissuing has to stay possible or the
   * first hand-out of a tool would be its last.
   */
  private async serialsStillOut(excludeFormId?: string) {
    const [issuedForms, returns] = await Promise.all([
      this.formRepository.find({
        where: { status: AssignmentFormStatus.ISSUED },
        // Oldest first, so a return cancels the hand-out it actually followed
        // and the form reported back is the one holding the unit now.
        order: { createdAt: 'ASC' },
      }),
      this.rtnRepository.find({ where: { status: RtnStatus.APPROVED } }),
    ]);

    const returned = new Map<string, number>();
    for (const doc of returns) {
      for (const line of doc.items ?? []) {
        for (const serial of splitSerials(line.serialNumbers)) {
          const key = serialKey(line.itemCode, serial);
          returned.set(key, (returned.get(key) ?? 0) + 1);
        }
      }
    }

    const out = new Map<string, { serial: string; form: AssignmentForm }>();
    for (const form of issuedForms) {
      if (excludeFormId && form.id === excludeFormId) continue;
      for (const line of form.items ?? []) {
        for (const serial of splitSerials(line.serialNumber)) {
          const key = serialKey(line.itemCode, serial);
          const pending = returned.get(key) ?? 0;
          if (pending > 0) {
            returned.set(key, pending - 1);
            out.delete(key);
            continue;
          }
          out.set(key, { serial, form });
        }
      }
    }
    return out;
  }

  /**
   * Refuses to issue a form that would hand out a serial someone is already
   * holding. Every clash is collected before throwing: fixing them one round
   * trip at a time is what makes a fifteen-line form unfillable.
   */
  private async assertSerialsAvailable(items: AssignmentFormLineItem[], currentFormId?: string) {
    const lines = (items ?? []).filter(line => (line.qtyIssued ?? 0) > 0);
    if (!lines.some(line => splitSerials(line.serialNumber).length)) return;

    const clashes: string[] = [];

    // Two lines of the same form claiming one serial is the same double-booking
    // and would otherwise slip past — neither has been issued yet, so nothing
    // already on record contradicts it.
    const seen = new Set<string>();
    for (const line of lines) {
      for (const serial of splitSerials(line.serialNumber)) {
        const key = serialKey(line.itemCode, serial);
        if (seen.has(key)) {
          clashes.push(
            `Serial number "${serial}" is entered twice on this form for item "${line.itemCode}".`,
          );
        }
        seen.add(key);
      }
    }

    const out = await this.serialsStillOut(currentFormId);
    for (const line of lines) {
      for (const serial of splitSerials(line.serialNumber)) {
        const holder = out.get(serialKey(line.itemCode, serial));
        if (!holder) continue;
        const who = fullName(holder.form.assignedTo) || 'another worker';
        clashes.push(
          `Serial number "${serial}" for item "${line.itemCode}" is already assigned to ` +
          `${who} on ${holder.form.assignmentNo}. It has to come back on a return (RTN) ` +
          `before it can be assigned again.`,
        );
      }
    }

    if (clashes.length) throw new BadRequestException(clashes.join(' '));
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

const fullName = (user?: User | null) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();

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

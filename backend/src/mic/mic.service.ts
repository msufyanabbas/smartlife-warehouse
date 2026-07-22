import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MicDocument, MicItemStatus, MicLineItem, MicStatus,
} from './entities/mic-document.entity';
import { CreateMicDto, MicItemDto, ReviewMicDto, UpdateMicDto } from './dto/mic.dto';
import { User } from '../users/entities/user.entity';
import { generateRefNumber } from '../common/utils/generate-ref-number';
import { joinSerials } from '../common/utils/serial-numbers';

/**
 * A MIC records what an assignment's items ended up doing on site. Stock has
 * already left the warehouse on the ASN, so approving one moves no quantities —
 * it is a confirmation record, not a stock movement.
 *
 * The worker who installed the materials raises it and submits it; a manager or
 * admin approves or rejects it. Both of those identities are taken from the
 * token rather than the request body, so neither can be claimed by a client.
 */
@Injectable()
export class MicService {
  constructor(
    @InjectRepository(MicDocument)
    private micRepository: Repository<MicDocument>,
  ) {}

  async findAll() {
    return this.micRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findPending() {
    return this.micRepository.find({
      where: { status: MicStatus.PENDING_APPROVAL },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string) {
    const doc = await this.micRepository.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`MIC ${id} not found`);
    return doc;
  }

  async create(dto: CreateMicDto, author: User) {
    assertEditableStatus(dto.status);

    const micNo = await generateRefNumber(this.micRepository, 'micNo', 'MIC');
    const doc = this.micRepository.create({
      ...dto,
      micNo,
      installedById: author.id,
      items: normalizeItems(dto.items),
    });
    const saved = await this.micRepository.save(doc);
    // Re-read so the eager `installedBy` / `verifiedBy` relations come back
    // populated — save() only echoes the ids it was handed.
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateMicDto) {
    const doc = await this.findOne(id);
    assertEditableStatus(dto.status);

    // Once approved the document is the record of what happened on site; the
    // way back is a rejection, not a quiet edit.
    if (doc.status === MicStatus.APPROVED) {
      throw new BadRequestException('This MIC has been approved and can no longer be edited.');
    }

    Object.assign(doc, dto);
    // `items` is a JSONB blob, so it is replaced wholesale rather than merged.
    if (dto.items) doc.items = normalizeItems(dto.items);

    // Re-submitting after a rejection starts the review over: leaving the old
    // verdict on the document would show a reviewer someone else's reason.
    if (doc.status === MicStatus.PENDING_APPROVAL) {
      doc.approvedById = null;
      doc.approvedAt = null;
      doc.rejectionReason = null;
    }

    await this.micRepository.save(doc);
    return this.findOne(id);
  }

  async review(id: string, dto: ReviewMicDto, reviewer: User) {
    const doc = await this.findOne(id);

    if (doc.status !== MicStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only a MIC awaiting approval can be reviewed.');
    }

    const reason = dto.rejectionReason?.trim();
    if (dto.action === 'reject' && !reason) {
      throw new BadRequestException('Give a reason so the worker knows what to correct.');
    }

    doc.status = dto.action === 'approve' ? MicStatus.APPROVED : MicStatus.REJECTED;
    doc.approvedById = reviewer.id;
    doc.approvedAt = new Date();
    doc.rejectionReason = dto.action === 'reject' ? reason : null;

    await this.micRepository.save(doc);
    // Re-read so `approvedBy` comes back as the reviewer, not the stale relation.
    return this.findOne(id);
  }
}

/**
 * `approved` and `rejected` carry an approver and a timestamp, so they are only
 * ever reached through `review`. A create or update that asks for one directly
 * would leave the document claiming a verdict nobody gave.
 */
function assertEditableStatus(status?: MicStatus) {
  if (status === MicStatus.APPROVED || status === MicStatus.REJECTED) {
    throw new BadRequestException(
      'Approving or rejecting a MIC is done from the review action, not by saving the form.',
    );
  }
}

/** Drops blank rows and fills the gaps a partially-typed row leaves behind. */
function normalizeItems(items?: MicItemDto[]): MicLineItem[] {
  return (items ?? [])
    .filter(i => i.itemCode?.trim() || i.itemDescription?.trim())
    .map(i => ({
      itemCode: i.itemCode ?? '',
      itemDescription: i.itemDescription ?? '',
      unit: i.unit ?? '',
      qtyReceived: i.qtyReceived ?? 0,
      qtyInstalled: i.qtyInstalled ?? 0,
      serialNumbers: joinSerials(i.serialNumbers),
      installDate: i.installDate ?? '',
      status: i.status ?? MicItemStatus.PENDING,
      itemId: i.itemId,
    }));
}

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
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { generateRefNumber } from '../common/utils/generate-ref-number';
import { joinSerials } from '../common/utils/serial-numbers';

@Injectable()
export class TransferFormsService {
  constructor(
    @InjectRepository(TransferForm)
    private formRepository: Repository<TransferForm>,
    @InjectRepository(InventoryItem)
    private inventoryRepository: Repository<InventoryItem>,
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

    Object.assign(doc, dto);
    if (dto.items) doc.items = normalizeItems(dto.items);

    const saved = await this.formRepository.save(doc);
    if (!wasCompleted && saved.status === TransferFormStatus.COMPLETED) {
      await this.applyTransfer(saved);
    }
    return saved;
  }

  /**
   * Completing a form is the primary way stock changes location. Each line's
   * inventory row is re-homed to the destination project/warehouse — quantities
   * are untouched (stock moved, not consumed) — and stamped with the form id.
   */
  private async applyTransfer(form: TransferForm) {
    for (const line of form.items) {
      if (line.qtyToTransfer <= 0) continue;

      // Prefer the explicit inventory link; fall back to SKU at the origin.
      const item = line.itemId
        ? await this.inventoryRepository.findOne({ where: { id: line.itemId } })
        : await this.inventoryRepository.findOne({
            where: { sku: line.itemCode?.trim() },
            order: { createdAt: 'DESC' },
          });
      if (!item) continue;

      // The destination site is keyed on schemeNo (what the stock report and the
      // transfer "from" filter group by); the warehouse maps to location.
      if (form.toProjectSite) item.schemeNo = form.toProjectSite;
      if (form.toWarehouse) item.location = form.toWarehouse;
      item.transferFormId = form.id;
      await this.inventoryRepository.save(item);
    }
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

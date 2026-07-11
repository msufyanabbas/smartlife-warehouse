import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  GrnCondition, GrnDocument, GrnLineItem, GrnStatus,
} from './entities/grn-document.entity';
import { CreateGrnDto, GrnItemDto, UpdateGrnDto } from './dto/grn.dto';
import { InventoryItem, ItemCondition } from '../inventory/entities/inventory-item.entity';
import { generateRefNumber } from '../common/utils/generate-ref-number';

@Injectable()
export class GrnService {
  constructor(
    @InjectRepository(GrnDocument)
    private grnRepository: Repository<GrnDocument>,
    @InjectRepository(InventoryItem)
    private inventoryRepository: Repository<InventoryItem>,
  ) {}

  async findAll() {
    return this.grnRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const doc = await this.grnRepository.findOne({ where: { id } });
    if (!doc) throw new NotFoundException(`GRN ${id} not found`);
    return doc;
  }

  async create(dto: CreateGrnDto) {
    const grnNo = await generateRefNumber(this.grnRepository, 'grnNo', 'GRN');
    const doc = this.grnRepository.create({
      ...dto,
      grnNo,
      items: normalizeItems(dto.items),
    });
    const saved = await this.grnRepository.save(doc);
    if (saved.status === GrnStatus.COMPLETED) {
      await this.linkGrnToInventory(saved);
    }
    return saved;
  }

  async update(id: string, dto: UpdateGrnDto) {
    const doc = await this.findOne(id);
    // Captured before the merge — afterwards doc.status already holds the new value.
    const wasCompleted = doc.status === GrnStatus.COMPLETED;

    Object.assign(doc, dto);
    // `items` is a JSONB blob, so it is replaced wholesale rather than merged.
    if (dto.items) doc.items = normalizeItems(dto.items);

    const saved = await this.grnRepository.save(doc);
    if (saved.status === GrnStatus.COMPLETED && !wasCompleted) {
      await this.linkGrnToInventory(saved);
    }
    return saved;
  }

  /**
   * A completed GRN is the primary way stock enters inventory. For every line
   * item received, this upserts an inventory row: matching stock (same SKU +
   * scheme) has its quantity topped up, otherwise a new row is created. Either
   * way the row is stamped with the GRN's id/number/receipt date so the stock
   * report can attribute it to a formal receipt.
   */
  private async linkGrnToInventory(grn: GrnDocument) {
    const schemeNo = grn.schemeNo?.trim() || null;
    const receivedAt = grn.dateOfReceipt ? new Date(grn.dateOfReceipt) : undefined;

    for (const lineItem of grn.items ?? []) {
      const sku = lineItem.itemCode?.trim();
      if (!sku || lineItem.receivedQty <= 0) continue;

      const existing = await this.inventoryRepository.findOne({
        where: { sku, schemeNo: schemeNo ?? IsNull() },
        order: { createdAt: 'DESC' },
      });

      if (existing) {
        // Top up matching stock and re-stamp the receipt provenance.
        existing.totalQuantity += lineItem.receivedQty;
        existing.availableQuantity += lineItem.receivedQty;
        existing.grnId = grn.id;
        existing.grnNo = grn.grnNo;
        if (receivedAt) existing.receivedAt = receivedAt;
        if (grn.purchaseOrderNo) existing.purchaseOrder = grn.purchaseOrderNo;
        if (grn.location) existing.location = grn.location;
        await this.inventoryRepository.save(existing);
        continue;
      }

      const item = this.inventoryRepository.create({
        name: lineItem.itemDescription?.trim() || sku,
        sku,
        productId: lineItem.productId || undefined,
        schemeNo: schemeNo ?? undefined,
        projectName: grn.projectName || undefined,
        serialNumber: lineItem.serialNumber || undefined,
        totalQuantity: lineItem.receivedQty,
        availableQuantity: lineItem.receivedQty,
        assignedQuantity: 0,
        usedQuantity: 0,
        condition: mapCondition(grn.conditionOnArrival),
        grnId: grn.id,
        grnNo: grn.grnNo,
        receivedAt,
        purchaseOrder: grn.purchaseOrderNo || undefined,
        location: grn.location || undefined,
      });
      await this.inventoryRepository.save(item);
    }
  }
}

/** Maps a GRN's arrival condition onto the inventory item's condition scale. */
function mapCondition(condition?: GrnCondition): ItemCondition {
  switch (condition) {
    case GrnCondition.DAMAGED:
    case GrnCondition.REJECTED:
      return ItemCondition.POOR;
    case GrnCondition.PARTIAL:
      return ItemCondition.GOOD;
    case GrnCondition.GOOD:
    default:
      return ItemCondition.NEW;
  }
}

/** Drops blank rows and fills the gaps a partially-typed row leaves behind. */
function normalizeItems(items?: GrnItemDto[]): GrnLineItem[] {
  return (items ?? [])
    .filter(i => i.itemCode?.trim() || i.itemDescription?.trim())
    .map(i => ({
      itemCode: i.itemCode ?? '',
      itemDescription: i.itemDescription ?? '',
      unit: i.unit ?? '',
      orderedQty: i.orderedQty ?? 0,
      receivedQty: i.receivedQty ?? 0,
      serialNumber: i.serialNumber ?? '',
      productId: i.productId,
    }));
}

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { InventoryItem } from './entities/inventory-item.entity';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  AddStockDto,
} from './dto/inventory.dto';

/** One inventory row whose assigned stock is not backed by assignment records. */
export interface IntegrityMismatch {
  id: string;
  name: string;
  sku: string;
  schemeNo: string | null;
  assignedQuantity: number;
  activeAssigned: number;
  /** Positive: stock booked out with no assignment behind it. Negative: the reverse. */
  difference: number;
  candidateForm: {
    id: string;
    assignmentNo: string;
    assignedToId: string | null;
    status: string;
  } | null;
}

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem)
    private itemRepository: Repository<InventoryItem>,
  ) {}

  async findAll() {
    return this.itemRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const item = await this.itemRepository.findOne({
      where: { id },
    });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  /**
   * Items whose `assignedQuantity` disagrees with the assignment rows behind it.
   *
   * The two are written by separate statements — the quantity moves on the item,
   * the assignment row records who holds it — so a failure between them (or any
   * path that moves stock without opening an assignment) leaves stock booked out
   * of the warehouse with nobody holding it. The stock report reconstructs its
   * Assigned column from the assignment rows, so it reads zero for those items
   * while the item itself still shows the quantity as gone.
   *
   * `candidateForm` names the assignment form whose lines cover the item, if any:
   * that is where a repair would get the recipient from.
   */
  async getIntegrityReport() {
    const mismatches: IntegrityMismatch[] = await this.itemRepository.query(`
      select i.id,
             i.name,
             i.sku,
             i."schemeNo",
             i."assignedQuantity"::int                                        as "assignedQuantity",
             coalesce(sum(a.quantity) filter (where a.status = 'active'), 0)::int as "activeAssigned",
             (i."assignedQuantity"
                - coalesce(sum(a.quantity) filter (where a.status = 'active'), 0))::int as difference,
             (select json_build_object('id', f.id, 'assignmentNo', f."assignmentNo",
                                       'assignedToId', f."assignedToId", 'status', f.status)
                from assignment_forms f
               where f.status = 'issued'
                 and exists (select 1 from jsonb_array_elements(f.items) line
                              where line->>'itemId' = i.id::text
                                 or lower(line->>'itemCode') = lower(i.sku))
               order by f."createdAt" desc
               limit 1)                                                       as "candidateForm"
        from inventory_items i
        left join assignments a on a."itemId" = i.id
       group by i.id
      having i."assignedQuantity"
             <> coalesce(sum(a.quantity) filter (where a.status = 'active'), 0)
       order by abs(i."assignedQuantity"
                    - coalesce(sum(a.quantity) filter (where a.status = 'active'), 0)) desc
    `);

    const itemsChecked = await this.itemRepository.count();
    return {
      itemsChecked,
      mismatchCount: mismatches.length,
      // Stock booked out of the warehouse that no assignment row accounts for.
      unaccountedQuantity: mismatches.reduce((sum, m) => sum + Math.max(m.difference, 0), 0),
      mismatches,
    };
  }

  /** Stock that arrived through a completed GRN document. */
  async getGrnReceipts() {
    return this.itemRepository.find({
      where: { grnId: Not(IsNull()) },
      select: [
        'id', 'name', 'sku', 'grnId', 'grnNo', 'schemeNo', 'projectName',
        'totalQuantity', 'category', 'serialNumber', 'createdAt', 'receivedAt',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async create(dto: CreateInventoryItemDto) {
    const existing = await this.itemRepository.findOne({
      where: { sku: dto.sku },
    });
  if (existing) {
    existing.totalQuantity += dto.totalQuantity;
    existing.availableQuantity += dto.totalQuantity;
    return this.itemRepository.save(existing);
  }
    const item = this.itemRepository.create({
      ...dto,
      availableQuantity: dto.totalQuantity,
      assignedQuantity: 0,
      usedQuantity: 0,
    });
    return this.itemRepository.save(item);
  }

  async bulkCreate(items: CreateInventoryItemDto[]) {
    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (const dto of items) {
      try {
        const existing = await this.itemRepository.findOne({
          where: { sku: dto.sku },
        });
        if (existing) {
          results.skipped++;
          results.errors.push(`SKU '${dto.sku}' already exists — skipped`);
          continue;
        }
        const item = this.itemRepository.create({
          ...dto,
          availableQuantity: dto.totalQuantity,
          assignedQuantity: 0,
          usedQuantity: 0,
        });
        await this.itemRepository.save(item);
        results.created++;
      } catch (e) {
        results.errors.push(`SKU '${dto.sku}': ${(e as Error).message}`);
      }
    }
    return results;
  }

  async update(id: string, dto: UpdateInventoryItemDto) {
    await this.findOne(id); // ensure it exists
    // Direct SQL UPDATE — include empty strings (clear the field), skip only undefined
    const updateData: any = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        updateData[key] = value === '' ? null : value;
      }
    }
    await this.itemRepository.update(id, updateData);
    return this.findOne(id);
  }

async addStock(id: string, dto: AddStockDto) {
  const item = await this.findOne(id);
  const targetScheme = dto.schemeNo?.trim();
  const isDifferentScheme = targetScheme && targetScheme !== item.schemeNo;

  if (isDifferentScheme) {
    // Destructure out id and TypeORM metadata so save() does an INSERT
    const { id: _id, createdAt, updatedAt, ...fields } = item as any;
    const newItem = this.itemRepository.create({
      ...fields,
      schemeNo: targetScheme,
      totalQuantity: dto.quantity,
      availableQuantity: dto.quantity,
      assignedQuantity: 0,
      usedQuantity: 0,
      receivedAt: dto.receivedAt ?? new Date(),
    });
    return this.itemRepository.save(newItem);
  }

  // Same scheme — increment existing record only
  item.totalQuantity += dto.quantity;
  item.availableQuantity += dto.quantity;
  if (dto.receivedAt) item.receivedAt = dto.receivedAt;
  return this.itemRepository.save(item);
}

  async removeStock(id: string, quantity: number, reason?: string) {
    const item = await this.findOne(id);

    if (quantity <= 0) throw new BadRequestException('Quantity must be greater than 0');
    if (quantity > item.availableQuantity) {
      throw new BadRequestException(
        `Cannot remove ${quantity} — only ${item.availableQuantity} available`,
      );
    }

    item.totalQuantity -= quantity;
    item.availableQuantity -= quantity;
    // Store reason in notes if provided, keeping an audit trail.
    if (reason) {
      const reasonLabel = {
        damaged: 'Damaged/Defective',
        expired: 'Expired',
        lost: 'Lost/Missing',
        returned_to_supplier: 'Returned to Supplier',
        adjustment: 'Stock Adjustment',
        other: 'Other',
      }[reason] || reason;
      item.notes = item.notes
        ? `${item.notes} | Stock removed (${reasonLabel})`
        : `Stock removed (${reasonLabel})`;
    }

    return this.itemRepository.save(item);
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    if (item.assignedQuantity > 0) {
      throw new BadRequestException('Cannot delete item with active assignments');
    }
    await this.itemRepository.remove(item);
    return { message: 'Item removed successfully' };
  }

  async getStats() {
    const items = await this.itemRepository.find();
    return {
      totalItems: items.length,
      totalStock: items.reduce((s, i) => s + i.totalQuantity, 0),
      totalAvailable: items.reduce((s, i) => s + i.availableQuantity, 0),
      totalAssigned: items.reduce((s, i) => s + i.assignedQuantity, 0),
      totalUsed: items.reduce((s, i) => s + i.usedQuantity, 0),
    };
  }

  async adjustQuantities(itemId: string, assignedDelta: number, availableDelta: number) {
    const item = await this.findOne(itemId);
    item.assignedQuantity += assignedDelta;
    item.availableQuantity += availableDelta;
    if (item.availableQuantity < 0) {
      throw new BadRequestException('Insufficient available quantity');
    }
    return this.itemRepository.save(item);
  }

  async recordUsage(itemId: string, quantityUsed: number) {
    const item = await this.findOne(itemId);

    if (quantityUsed > 0 && item.assignedQuantity < quantityUsed) {
      throw new BadRequestException(
        `Cannot consume more than assigned quantity (${item.assignedQuantity})`,
      );
    }

    item.usedQuantity += quantityUsed;

    // When items are consumed, remove them from total stock and assigned count
    // quantityUsed > 0  = consuming items (deduct from total + assigned)
    // quantityUsed < 0  = reversing a usage log (add back to total + assigned)
    item.totalQuantity -= quantityUsed;
    item.assignedQuantity -= quantityUsed;

    return this.itemRepository.save(item);
  }
}
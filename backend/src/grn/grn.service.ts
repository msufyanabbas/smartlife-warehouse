import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GrnDocument, GrnLineItem } from './entities/grn-document.entity';
import { CreateGrnDto, GrnItemDto, UpdateGrnDto } from './dto/grn.dto';
import { generateRefNumber } from '../common/utils/generate-ref-number';

@Injectable()
export class GrnService {
  constructor(
    @InjectRepository(GrnDocument)
    private grnRepository: Repository<GrnDocument>,
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
    return this.grnRepository.save(doc);
  }

  async update(id: string, dto: UpdateGrnDto) {
    const doc = await this.findOne(id);
    Object.assign(doc, dto);
    // `items` is a JSONB blob, so it is replaced wholesale rather than merged.
    if (dto.items) doc.items = normalizeItems(dto.items);
    return this.grnRepository.save(doc);
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

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransferForm, TransferFormLineItem } from './entities/transfer-form.entity';
import {
  CreateTransferFormDto,
  TransferFormItemDto,
  UpdateTransferFormDto,
} from './dto/transfer-form.dto';
import { generateRefNumber } from '../common/utils/generate-ref-number';

@Injectable()
export class TransferFormsService {
  constructor(
    @InjectRepository(TransferForm)
    private formRepository: Repository<TransferForm>,
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
    return this.formRepository.save(doc);
  }

  async update(id: string, dto: UpdateTransferFormDto) {
    const doc = await this.findOne(id);
    Object.assign(doc, dto);
    if (dto.items) doc.items = normalizeItems(dto.items);
    return this.formRepository.save(doc);
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
      serialNumber: i.serialNumber ?? '',
      itemId: i.itemId,
    }));
}

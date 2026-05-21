import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  async findAll(search?: string, categoryId?: string) {
    const where: any = {};
    if (categoryId) where.categoryId = categoryId;

    if (search) {
      return this.productRepository.find({
        where: [
          { name: ILike(`%${search}%`) },
          { sku: ILike(`%${search}%`) },
        ],
        relations: ['category'],
        order: { name: 'ASC' },
        take: 20,
      });
    }

    return this.productRepository.find({
      where,
      relations: ['category'],
      order: { name: 'ASC' },
    });
  }

  async search(query: string) {
    // For auto-suggest — returns top 10 matches
    return this.productRepository.find({
      where: [
        { name: ILike(`%${query}%`) },
        { sku: ILike(`%${query}%`) },
      ],
      relations: ['category'],
      order: { name: 'ASC' },
      take: 10,
    });
  }

  async findOne(id: string) {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findBySku(sku: string) {
    return this.productRepository.findOne({
      where: { sku },
      relations: ['category'],
    });
  }

  async create(dto: CreateProductDto) {
    if (dto.sku) dto.sku = dto.sku.trim();
    // SKU must be globally unique — check existence regardless of any flag
    const existing = await this.productRepository.findOne({ where: { sku: dto.sku } });
    if (existing) throw new ConflictException('SKU already exists');
    const product = this.productRepository.create(dto);
    return this.productRepository.save(product);
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id); // ensure it exists
    if (dto.sku) dto.sku = dto.sku.trim();
    // Direct SQL UPDATE — include empty strings (clear the field), skip only undefined
    const updateData: any = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        updateData[key] = value === '' ? null : value;
      }
    }
    await this.productRepository.update(id, updateData);
    return this.findOne(id); // reload with category relation
  }

  async remove(id: string) {
    const product = await this.findOne(id);
    await this.productRepository.remove(product);
    return { message: 'Product removed' };
  }
}
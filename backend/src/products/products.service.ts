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
    const where: any = { isActive: true };
    if (categoryId) where.categoryId = categoryId;

    if (search) {
      return this.productRepository.find({
        where: [
          { isActive: true, name: ILike(`%${search}%`) },
          { isActive: true, sku: ILike(`%${search}%`) },
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
        { isActive: true, name: ILike(`%${query}%`) },
        { isActive: true, sku: ILike(`%${query}%`) },
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
      where: { sku, isActive: true },
      relations: ['category'],
    });
  }

  async create(dto: CreateProductDto) {
    const existing = await this.productRepository.findOne({ where: { sku: dto.sku } });
    if (existing) throw new ConflictException(`Product with SKU "${dto.sku}" already exists`);
    const product = this.productRepository.create(dto);
    return this.productRepository.save(product);
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.findOne(id);
    if (dto.sku && dto.sku !== product.sku) {
      const existing = await this.productRepository.findOne({ where: { sku: dto.sku } });
      if (existing) throw new ConflictException(`SKU "${dto.sku}" already taken`);
    }
    Object.assign(product, dto);
    return this.productRepository.save(product);
  }

  async remove(id: string) {
    const product = await this.findOne(id);
    product.isActive = false;
    await this.productRepository.save(product);
    return { message: 'Product removed' };
  }
}
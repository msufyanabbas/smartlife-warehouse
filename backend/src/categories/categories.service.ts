import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
  ) {}

  async findAll() {
    // Return tree structure: top-level categories with their children
    const all = await this.categoryRepository.find({
      relations: ['children'],
      order: { name: 'ASC' },
    });
    // Return only top-level (parentId is null), children are nested
    return all.filter(c => !c.parentId);
  }

  async findFlat() {
    // Return all categories flat for dropdowns
    return this.categoryRepository.find({
      relations: ['parent'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string) {
    const cat = await this.categoryRepository.findOne({
      where: { id },
      relations: ['children', 'parent'],
    });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.categoryRepository.findOne({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent category not found');
      // Only allow one level of nesting
      if (parent.parentId) throw new BadRequestException('Cannot create subcategory of a subcategory');
    }
    const cat = this.categoryRepository.create(dto);
    return this.categoryRepository.save(cat);
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id); // ensure it exists
    // Direct SQL UPDATE — include empty strings (clear the field), skip only undefined
    const updateData: any = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        updateData[key] = value === '' ? null : value;
      }
    }
    await this.categoryRepository.update(id, updateData);
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id); // ensure it exists
    await this.categoryRepository.delete(id);
    return { message: 'Category removed' };
  }
}
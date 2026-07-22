import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findAll() {
    return this.userRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');
    const hashed = await bcrypt.hash(dto.password, 12);
    const user = this.userRepository.create({ ...dto, password: hashed });
    return this.userRepository.save(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id); // ensure it exists
    // Direct SQL UPDATE — include empty strings (clear the field), skip only undefined
    const updateData: any = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        updateData[key] = value === '' ? null : value;
      }
    }
    await this.userRepository.update(id, updateData);
    return this.findOne(id);
  }

  async remove(id: string, currentUser: User) {
    if (currentUser?.id === id) {
      throw new BadRequestException('You cannot delete your own account');
    }
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
    return { message: 'User deleted successfully' };
  }

  async deactivate(id: string) {
    const user = await this.findOne(id);
    user.isActive = false;
    await this.userRepository.save(user);
    return { message: 'User deactivated successfully' };
  }

  /**
   * Everyone who can sign off a document. Unlike the rest of this service it is
   * reachable by workers — the person filling in a form has to be able to name
   * their approver — so it returns names and nothing else.
   */
  async findApprovers() {
    return this.userRepository.find({
      where: [
        { role: Role.ADMIN, isActive: true },
        { role: Role.MANAGER, isActive: true },
      ],
      select: ['id', 'firstName', 'lastName', 'role'],
      order: { firstName: 'ASC' },
    });
  }

  async findWorkers() {
    const { Role } = await import('../common/enums/role.enum');
    return this.userRepository.find({
      where: { role: Role.WORKER, isActive: true },
      order: { firstName: 'ASC' },
    });
  }
}
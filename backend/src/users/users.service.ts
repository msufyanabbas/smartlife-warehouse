import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

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
    const user = await this.findOne(id);
    Object.assign(user, dto);
    return this.userRepository.save(user);
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    user.isActive = false;
    await this.userRepository.save(user);
    return { message: 'User deactivated successfully' };
  }

  async findWorkers() {
    const { Role } = await import('../common/enums/role.enum');
    return this.userRepository.find({
      where: { role: Role.WORKER, isActive: true },
      order: { firstName: 'ASC' },
    });
  }
}

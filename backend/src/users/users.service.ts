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

    // Direct SQL UPDATE — skip only undefined, so an empty string still reaches
    // the column and clears it.
    //
    // Except where the column cannot be null. Blanking `department` is a request
    // to erase it; blanking `firstName` used to send NULL at a NOT NULL column,
    // and the driver's error is not an HttpException, so the whole request came
    // back as a 500. Nullability is read off the entity metadata rather than
    // listed here, so a column added later cannot quietly reintroduce it.
    // (`firstName`/`lastName` are also rejected as empty by the DTO, which turns
    // the same mistake into a 400 that says what is wrong.)
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue;
      const column = this.userRepository.metadata.findColumnWithPropertyName(key);
      updateData[key] = value === '' && column?.isNullable ? null : value;
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
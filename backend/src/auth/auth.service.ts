import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = this.userRepository.create({ ...dto, password: hashed });
    await this.userRepository.save(user);

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.buildAuthResponse(user);
  }

  async getProfile(userId: string) {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  private buildAuthResponse(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);
    const { password, ...userWithoutPassword } = user as any;
    return {
      accessToken: token,
      user: userWithoutPassword,
    };
  }
}

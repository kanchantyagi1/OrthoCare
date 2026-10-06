import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Nurse } from './entities/nurse.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class NursesService {
  constructor(
    @InjectRepository(Nurse) private readonly repo: Repository<Nurse>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  findByUserId(userId: string) {
    return this.repo.findOne({ where: { userId } });
  }

  async findByUserIdOrThrow(userId: string) {
    const nurse = await this.findByUserId(userId);
    if (!nurse) throw new NotFoundException('Nurse profile not found for this user');
    return nurse;
  }

  findAll() {
    return this.repo.find({ relations: ['user'] });
  }

  findOne(id: string) {
    return this.repo.findOne({ where: { id }, relations: ['user'] });
  }

  async create(data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    employeeCode?: string;
  }) {
    const passwordHash = await AuthService.hashPassword(data.password);
    const user = this.userRepo.create({
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      role: Role.NURSE,
    });
    const savedUser = await this.userRepo.save(user);

    const nurse = this.repo.create({
      userId: savedUser.id,
      employeeCode: data.employeeCode,
      isActive: true,
    });
    return this.repo.save(nurse);
  }

  async setActive(id: string, isActive: boolean) {
    await this.repo.update({ id }, { isActive });
    return this.findOne(id);
  }

  get repository() {
    return this.repo;
  }
}

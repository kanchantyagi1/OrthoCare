import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Doctor } from './entities/doctor.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectRepository(Doctor) private readonly repo: Repository<Doctor>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  findAll() {
    return this.repo.find({ relations: ['user'] });
  }

  findOne(id: string) {
    return this.repo.findOne({ where: { id }, relations: ['user'] });
  }

  findByUserId(userId: string) {
    return this.repo.findOne({ where: { userId } });
  }

  async create(data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    specialization?: string;
    licenseNumber?: string;
  }) {
    const passwordHash = await AuthService.hashPassword(data.password);
    const user = this.userRepo.create({
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      role: Role.DOCTOR,
    });
    const savedUser = await this.userRepo.save(user);

    const doctor = this.repo.create({
      userId: savedUser.id,
      specialization: data.specialization,
      licenseNumber: data.licenseNumber,
    });
    return this.repo.save(doctor);
  }
}

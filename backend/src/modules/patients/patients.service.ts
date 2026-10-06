import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from './entities/patient.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient) private readonly repo: Repository<Patient>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  findByUserId(userId: string) {
    return this.repo.findOne({ where: { userId } });
  }

  async findByUserIdOrThrow(userId: string) {
    const patient = await this.findByUserId(userId);
    if (!patient) throw new NotFoundException('Patient profile not found for this user');
    return patient;
  }

  findOne(id: string) {
    return this.repo.findOne({ where: { id }, relations: ['user', 'doctor'] });
  }

  findAll() {
    return this.repo.find({ relations: ['user', 'doctor'] });
  }

  async create(data: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    surgeryType?: string;
    surgeryDate?: string;
    doctorId?: string;
    preferredLanguage?: string;
  }) {
    const passwordHash = await AuthService.hashPassword(data.password);
    const user = this.userRepo.create({
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      role: Role.PATIENT,
    });
    const savedUser = await this.userRepo.save(user);

    const patient = this.repo.create({
      userId: savedUser.id,
      surgeryType: data.surgeryType,
      surgeryDate: data.surgeryDate,
      doctorId: data.doctorId,
      preferredLanguage: data.preferredLanguage || 'en',
    });
    return this.repo.save(patient);
  }
}

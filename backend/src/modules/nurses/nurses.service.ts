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

  async update(
    id: string,
    data: { fullName?: string; phone?: string; isActive?: boolean },
  ) {
    const nurse = await this.findOne(id);
    if (!nurse) throw new NotFoundException('Nurse not found');

    const userPatch: Partial<User> = {};
    if (data.fullName !== undefined) userPatch.fullName = data.fullName;
    if (data.phone !== undefined) userPatch.phone = data.phone;
    if (data.isActive !== undefined) userPatch.isActive = data.isActive;
    if (Object.keys(userPatch).length > 0) {
      await this.userRepo.update({ id: nurse.userId }, userPatch);
    }

    if (data.isActive !== undefined) {
      await this.repo.update({ id }, { isActive: data.isActive });
    }
    return this.findOne(id);
  }

  /// Deactivates instead of deleting. Attendance records, escalation assignments and
  /// case notes reference this nurse and must survive for audit, and a deactivated
  /// nurse is already excluded from getCurrentAvailableNurse() assignment.
  async deactivate(id: string) {
    const nurse = await this.findOne(id);
    if (!nurse) throw new NotFoundException('Nurse not found');
    await this.repo.update({ id }, { isActive: false });
    await this.userRepo.update({ id: nurse.userId }, { isActive: false });
    return { id, deactivated: true };
  }

  get repository() {
    return this.repo;
  }
}

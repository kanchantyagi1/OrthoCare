import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Doctor } from './entities/doctor.entity';
import { User } from '../users/entities/user.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { Role } from '../../common/enums/role.enum';
import { AuthService } from '../auth/auth.service';
import { DoctorListItem, toDoctorListItem } from './doctors.mapper';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectRepository(Doctor) private readonly repo: Repository<Doctor>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Shift) private readonly shiftRepo: Repository<Shift>,
  ) {}

  findByUserId(userId: string) {
    return this.repo.findOne({ where: { userId } });
  }

  async findByUserIdOrThrow(userId: string) {
    const doctor = await this.findByUserId(userId);
    if (!doctor) throw new NotFoundException('Doctor profile not found for this user');
    return doctor;
  }

  findAll() {
    return this.repo.find({ relations: ['user'] });
  }

  /**
   * Flat rows for the admin Doctor Management screen. Removed (deactivated) doctors
   * are excluded by default - they were previously still returned here despite
   * DELETE /doctors/:id "removing" them, which is why a removed doctor kept showing
   * up everywhere. Pass includeInactive to see them for the purpose of restoring one.
   */
  async listForAdmin(includeInactive = false): Promise<DoctorListItem[]> {
    const doctors = await this.repo.find({
      where: includeInactive ? {} : { isActive: true },
      relations: ['user'],
    });
    return doctors.map(toDoctorListItem);
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
      employeeCode: data.employeeCode,
      specialization: data.specialization,
      licenseNumber: data.licenseNumber,
      isActive: true,
    });
    return this.repo.save(doctor);
  }

  async setActive(id: string, isActive: boolean) {
    await this.repo.update({ id }, { isActive });
    return this.findOne(id);
  }

  async update(
    id: string,
    data: { fullName?: string; phone?: string; isActive?: boolean },
  ) {
    const doctor = await this.findOne(id);
    if (!doctor) throw new NotFoundException('Doctor not found');

    const userPatch: Partial<User> = {};
    if (data.fullName !== undefined) userPatch.fullName = data.fullName;
    if (data.phone !== undefined) userPatch.phone = data.phone;
    if (data.isActive !== undefined) userPatch.isActive = data.isActive;
    if (Object.keys(userPatch).length > 0) {
      await this.userRepo.update({ id: doctor.userId }, userPatch);
    }

    if (data.isActive !== undefined) {
      await this.repo.update({ id }, { isActive: data.isActive });
    }
    return this.findOne(id);
  }

  /// Deactivates instead of deleting. Attendance records, escalation assignments and
  /// case notes reference this doctor and must survive for audit, and a deactivated
  /// doctor is already excluded from getCurrentAvailableDoctor() assignment.
  ///
  /// Also deactivates the doctor's shifts, in the same transaction: previously only
  /// the doctor row flipped, so their shifts stayed isActive=true and kept showing up
  /// in Shift Management and doctor pickers - a removed doctor "still showing
  /// everywhere" was this, not a caching issue. Re-activating a doctor later does NOT
  /// resurrect these shifts; an admin recreates them deliberately.
  async deactivate(id: string) {
    const doctor = await this.findOne(id);
    if (!doctor) throw new NotFoundException('Doctor not found');

    await this.repo.manager.transaction(async (manager) => {
      await manager.update(Doctor, { id }, { isActive: false });
      await manager.update(User, { id: doctor.userId }, { isActive: false });
      await manager.update(Shift, { doctorId: id }, { isActive: false });
    });

    return { id, deactivated: true };
  }

  get repository() {
    return this.repo;
  }
}

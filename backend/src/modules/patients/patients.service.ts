import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from './entities/patient.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { AuthService } from '../auth/auth.service';

/**
 * Reduces a typed-in phone number to one canonical form, so the same person always
 * resolves to the same patient row no matter how they typed it.
 *
 * This matters more than it looks: the phone number IS the patient's identity and the
 * number a nurse calls back, so "+91 98765 43210", "09876543210" and "9876543210"
 * fragmenting into three patients would scatter one person's history and escalations.
 *
 * All non-digits are stripped, then any country code / trunk prefix is dropped by
 * keeping the last 10 digits. That is an assumption that subscriber numbers are 10
 * digits, which holds for India (this is a single-clinic Indian deployment) but not
 * everywhere - swap in libphonenumber-js here before using this in a country where
 * national numbers are a different length.
 */
const NATIONAL_NUMBER_LENGTH = 10;

export function normalisePhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    throw new BadRequestException('Please enter a valid phone number');
  }
  return digits.length > NATIONAL_NUMBER_LENGTH
    ? digits.slice(-NATIONAL_NUMBER_LENGTH)
    : digits;
}

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

  async findOneOrThrow(id: string) {
    const patient = await this.findOne(id);
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  findAll() {
    return this.repo.find({ relations: ['user', 'doctor'] });
  }

  /**
   * Account-less patient entry point: the phone number IS the identity. Returns the
   * existing row for a number that has chatted before so their history and open
   * escalations stay attached to them.
   */
  async findOrCreateByPhone(rawPhone: string, name?: string): Promise<Patient> {
    const phone = normalisePhone(rawPhone);

    const existing = await this.repo.findOne({ where: { phone } });
    if (existing) {
      // Let a returning patient correct/supply their name without creating a duplicate.
      if (name && name.trim() && name.trim() !== existing.fullName) {
        existing.fullName = name.trim();
        await this.repo.save(existing);
      }
      return existing;
    }

    return this.repo.save(
      this.repo.create({
        phone,
        fullName: name?.trim() || undefined,
        preferredLanguage: 'en',
      }),
    );
  }

  /** Legacy path: creates a patient that does have a login. Not used by the app. */
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
      fullName: data.fullName,
      phone: data.phone,
      surgeryType: data.surgeryType,
      surgeryDate: data.surgeryDate,
      doctorId: data.doctorId,
      preferredLanguage: data.preferredLanguage || 'en',
    });
    return this.repo.save(patient);
  }

  get repository() {
    return this.repo;
  }
}

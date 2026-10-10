import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shift } from './entities/shift.entity';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { ShiftListItem, toShiftListItem } from './shifts.mapper';

@Injectable()
export class ShiftsService {
  constructor(@InjectRepository(Shift) private readonly repo: Repository<Shift>) {}

  findAll() {
    return this.repo.find({ order: { startTime: 'ASC' } });
  }

  /**
   * Flat rows including the doctor's name; times stay as "HH:mm" strings.
   *
   * Excludes shifts belonging to a removed (deactivated) doctor. DoctorsService
   * already deactivates a doctor's own shifts when the doctor is removed, but this
   * filter also covers the case of a shift left over from before that fix, or any
   * other path that deactivates a doctor without going through it.
   */
  async listForApi(): Promise<ShiftListItem[]> {
    const shifts = await this.repo
      .createQueryBuilder('shift')
      .innerJoinAndSelect('shift.doctor', 'doctor')
      .leftJoinAndSelect('doctor.user', 'user')
      .where('shift.is_active = true')
      .andWhere('doctor.is_active = true')
      .orderBy('shift.start_time', 'ASC')
      .getMany();
    return shifts.map(toShiftListItem);
  }

  findForDoctor(doctorId: string) {
    return this.repo.find({ where: { doctorId }, order: { startTime: 'ASC' } });
  }

  async findOne(id: string) {
    const shift = await this.repo.findOne({ where: { id } });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  create(dto: CreateShiftDto) {
    const shift = this.repo.create(dto);
    return this.repo.save(shift);
  }

  async update(id: string, dto: UpdateShiftDto) {
    const shift = await this.findOne(id);
    Object.assign(shift, dto);
    return this.repo.save(shift);
  }

  async remove(id: string) {
    const shift = await this.findOne(id);
    await this.repo.remove(shift);
    return { success: true };
  }

  get repository() {
    return this.repo;
  }
}

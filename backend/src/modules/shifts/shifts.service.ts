import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shift } from './entities/shift.entity';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';

@Injectable()
export class ShiftsService {
  constructor(@InjectRepository(Shift) private readonly repo: Repository<Shift>) {}

  findAll() {
    return this.repo.find({ order: { startTime: 'ASC' } });
  }

  findForNurse(nurseId: string) {
    return this.repo.find({ where: { nurseId }, order: { startTime: 'ASC' } });
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

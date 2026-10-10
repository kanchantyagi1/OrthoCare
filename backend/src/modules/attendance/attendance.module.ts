import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attendance } from './entities/attendance.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AuditModule } from '../audit/audit.module';
import { DoctorsModule } from '../doctors/doctors.module';

@Module({
  imports: [TypeOrmModule.forFeature([Attendance, Doctor, Shift]), AuditModule, DoctorsModule],
  providers: [AttendanceService],
  controllers: [AttendanceController],
  exports: [AttendanceService],
})
export class AttendanceModule {}

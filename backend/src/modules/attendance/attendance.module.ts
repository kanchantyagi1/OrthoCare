import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attendance } from './entities/attendance.entity';
import { Nurse } from '../nurses/entities/nurse.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AuditModule } from '../audit/audit.module';
import { NursesModule } from '../nurses/nurses.module';

@Module({
  imports: [TypeOrmModule.forFeature([Attendance, Nurse, Shift]), AuditModule, NursesModule],
  providers: [AttendanceService],
  controllers: [AttendanceController],
  exports: [AttendanceService],
})
export class AttendanceModule {}

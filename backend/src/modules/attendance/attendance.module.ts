import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attendance } from './entities/attendance.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AuditModule } from '../audit/audit.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { EscalationsModule } from '../escalations/escalations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attendance, Doctor, Shift]),
    AuditModule,
    DoctorsModule,
    // Punch-in sweeps the unassigned case queue. EscalationsModule imports this
    // module back (for getCurrentAvailableDoctor), so both sides use forwardRef.
    forwardRef(() => EscalationsModule),
  ],
  providers: [AttendanceService],
  controllers: [AttendanceController],
  exports: [AttendanceService],
})
export class AttendanceModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Escalation } from './entities/escalation.entity';
import { NurseCaseNote } from './entities/nurse-case-note.entity';
import { EscalationsService } from './escalations.service';
import { EscalationsController } from './escalations.controller';
import { AttendanceModule } from '../attendance/attendance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { NursesModule } from '../nurses/nurses.module';
import { PatientsModule } from '../patients/patients.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Escalation, NurseCaseNote]),
    AttendanceModule,
    NotificationsModule,
    UsersModule,
    NursesModule,
    PatientsModule,
    AuditModule,
  ],
  providers: [EscalationsService],
  controllers: [EscalationsController],
  exports: [EscalationsService],
})
export class EscalationsModule {}

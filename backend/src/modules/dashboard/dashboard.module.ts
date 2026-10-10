import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attendance } from '../attendance/entities/attendance.entity';
import { Doctor } from '../doctors/entities/doctor.entity';
import { Escalation } from '../escalations/entities/escalation.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { DoctorsModule } from '../doctors/doctors.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attendance, Doctor, Escalation, ChatMessage, ChatSession, Shift]),
    DoctorsModule,
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}

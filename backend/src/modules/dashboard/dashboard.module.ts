import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attendance } from '../attendance/entities/attendance.entity';
import { Nurse } from '../nurses/entities/nurse.entity';
import { Escalation } from '../escalations/entities/escalation.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { NursesModule } from '../nurses/nurses.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attendance, Nurse, Escalation, ChatMessage, ChatSession, Shift]),
    NursesModule,
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}

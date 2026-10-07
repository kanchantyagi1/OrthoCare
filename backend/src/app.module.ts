import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DoctorsModule } from './modules/doctors/doctors.module';
import { NursesModule } from './modules/nurses/nurses.module';
import { PatientsModule } from './modules/patients/patients.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { StorageModule } from './modules/storage/storage.module';
import { AiModule } from './modules/ai/ai.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ChatModule } from './modules/chat/chat.module';
import { RedFlagRulesModule } from './modules/red-flag-rules/red-flag-rules.module';
import { EscalationsModule } from './modules/escalations/escalations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditModule } from './modules/audit/audit.module';
import { RetentionModule } from './modules/retention/retention.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    // Global per-IP ceiling. The public (login-less) patient chat routes layer
    // tighter per-phone/per-session limits on top - see PatientThrottlerGuard.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('database.url'),
        autoLoadEntities: true,
        synchronize: false,
        logging: false,
      }),
    }),

    AuthModule,
    UsersModule,
    DoctorsModule,
    NursesModule,
    PatientsModule,
    ShiftsModule,
    AttendanceModule,
    StorageModule,
    AiModule,
    KnowledgeModule,
    DocumentsModule,
    ChatModule,
    RedFlagRulesModule,
    EscalationsModule,
    NotificationsModule,
    DashboardModule,
    AuditModule,
    RetentionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

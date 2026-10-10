import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DoctorsService } from '../doctors/doctors.service';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DOCTOR)
@Controller()
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly doctors: DoctorsService,
  ) {}

  @Get('dashboard')
  overview() {
    return this.dashboard.overview();
  }

  // Method-level @Roles overrides the class-level ADMIN/DOCTOR restriction.
  // Declared before 'dashboard' has no bearing here since paths differ exactly.
  @Roles(Role.DOCTOR)
  @Get('dashboard/doctor')
  async doctorOverview(@CurrentUser() user: { id: string }) {
    const doctor = await this.doctors.findByUserIdOrThrow(user.id);
    return this.dashboard.doctorOverview(doctor.id);
  }

  @Get('reports/attendance')
  attendance() {
    return this.dashboard.attendanceReport();
  }

  @Get('reports/escalations')
  escalations() {
    return this.dashboard.escalationsReport();
  }

  @Get('reports/assistant')
  assistantReport() {
    return this.dashboard.assistantReport();
  }
}

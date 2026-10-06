import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DOCTOR)
@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard')
  overview() {
    return this.dashboard.overview();
  }

  @Get('reports/attendance')
  attendance() {
    return this.dashboard.attendanceReport();
  }

  @Get('reports/escalations')
  escalations() {
    return this.dashboard.escalationsReport();
  }

  @Get('reports/ai')
  ai() {
    return this.dashboard.aiReport();
  }
}

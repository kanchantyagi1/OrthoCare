import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NursesService } from '../nurses/nurses.service';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DOCTOR)
@Controller()
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly nurses: NursesService,
  ) {}

  @Get('dashboard')
  overview() {
    return this.dashboard.overview();
  }

  // Method-level @Roles overrides the class-level ADMIN/DOCTOR restriction.
  // Declared before 'dashboard' has no bearing here since paths differ exactly.
  @Roles(Role.NURSE)
  @Get('dashboard/nurse')
  async nurseOverview(@CurrentUser() user: { id: string }) {
    const nurse = await this.nurses.findByUserIdOrThrow(user.id);
    return this.dashboard.nurseOverview(nurse.id);
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

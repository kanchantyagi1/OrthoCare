import { Body, Controller, Get, Inject, Post, UseGuards, forwardRef } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';
import { DoctorsService } from '../doctors/doctors.service';
import { EscalationsService } from '../escalations/escalations.service';
import { PunchInDto } from './dto/punch-in.dto';
import { PunchOutDto } from './dto/punch-out.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DOCTOR)
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly doctors: DoctorsService,
    // forwardRef because EscalationsModule imports AttendanceModule for
    // getCurrentAvailableDoctor(), so the two modules reference each other.
    @Inject(forwardRef(() => EscalationsService))
    private readonly escalations: EscalationsService,
  ) {}

  @Post('punch-in')
  async punchIn(@CurrentUser() user: { id: string }, @Body() dto: PunchInDto) {
    const doctor = await this.doctors.findByUserIdOrThrow(user.id);
    const result = await this.attendance.punchIn(doctor.id, dto, user.id);

    // Cases raised while nobody was on shift are unassigned; the doctor coming on
    // duty picks them up, otherwise they wait indefinitely for an assignment that
    // is only ever attempted at creation time.
    const claimedWaitingCases = result.duplicate
      ? 0
      : await this.escalations.assignWaitingCasesTo(doctor.id);

    return { ...result, claimedWaitingCases };
  }

  @Post('punch-out')
  async punchOut(@CurrentUser() user: { id: string }, @Body() dto: PunchOutDto) {
    const doctor = await this.doctors.findByUserIdOrThrow(user.id);
    return this.attendance.punchOut(doctor.id, dto, user.id);
  }

  @Get('today')
  async today(@CurrentUser() user: { id: string }) {
    const doctor = await this.doctors.findByUserIdOrThrow(user.id);
    return this.attendance.today(doctor.id);
  }
}

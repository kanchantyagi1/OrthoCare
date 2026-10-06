import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';
import { NursesService } from '../nurses/nurses.service';
import { PunchInDto } from './dto/punch-in.dto';
import { PunchOutDto } from './dto/punch-out.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.NURSE)
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly nurses: NursesService,
  ) {}

  @Post('punch-in')
  async punchIn(@CurrentUser() user: { id: string }, @Body() dto: PunchInDto) {
    const nurse = await this.nurses.findByUserIdOrThrow(user.id);
    return this.attendance.punchIn(nurse.id, dto, user.id);
  }

  @Post('punch-out')
  async punchOut(@CurrentUser() user: { id: string }, @Body() dto: PunchOutDto) {
    const nurse = await this.nurses.findByUserIdOrThrow(user.id);
    return this.attendance.punchOut(nurse.id, dto, user.id);
  }

  @Get('today')
  async today(@CurrentUser() user: { id: string }) {
    const nurse = await this.nurses.findByUserIdOrThrow(user.id);
    return this.attendance.today(nurse.id);
  }
}

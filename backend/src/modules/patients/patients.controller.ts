import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Roles(Role.ADMIN, Role.DOCTOR)
  @Get()
  findAll() {
    return this.patients.findAll();
  }

  @Roles(Role.ADMIN, Role.DOCTOR)
  @Post()
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto);
  }

  @Roles(Role.PATIENT)
  @Get('me')
  me(@CurrentUser() user: { id: string }) {
    return this.patients.findByUserIdOrThrow(user.id);
  }
}

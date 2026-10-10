import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  // Readable by doctors too, because the shift-management and case screens need to
  // resolve colleagues' names. Everything that creates, edits or disables an account
  // is admin-only: a doctor provisioning or deactivating another doctor would be a
  // privilege-escalation path, and the previous code allowed exactly that.
  @Roles(Role.ADMIN, Role.DOCTOR)
  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.doctors.listForAdmin(includeInactive === 'true' || includeInactive === '1');
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateDoctorDto) {
    return this.doctors.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.doctors.setActive(id, isActive);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.doctors.update(id, dto);
  }

  // Deactivates rather than hard-deleting - see DoctorsService.deactivate().
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.doctors.deactivate(id);
  }
}

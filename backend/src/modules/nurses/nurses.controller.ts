import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { NursesService } from './nurses.service';
import { CreateNurseDto } from './dto/create-nurse.dto';
import { UpdateNurseDto } from './dto/update-nurse.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('nurses')
export class NursesController {
  constructor(private readonly nurses: NursesService) {}

  @Roles(Role.ADMIN, Role.DOCTOR)
  @Get()
  findAll() {
    return this.nurses.listForAdmin();
  }

  @Roles(Role.ADMIN, Role.DOCTOR)
  @Post()
  create(@Body() dto: CreateNurseDto) {
    return this.nurses.create(dto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR)
  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.nurses.setActive(id, isActive);
  }

  @Roles(Role.ADMIN, Role.DOCTOR)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNurseDto) {
    return this.nurses.update(id, dto);
  }

  // Deactivates rather than hard-deleting - see NursesService.deactivate().
  @Roles(Role.ADMIN, Role.DOCTOR)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.nurses.deactivate(id);
  }
}

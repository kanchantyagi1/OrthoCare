import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { NursesService } from './nurses.service';
import { CreateNurseDto } from './dto/create-nurse.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('nurses')
export class NursesController {
  constructor(private readonly nurses: NursesService) {}

  @Roles(Role.ADMIN, Role.DOCTOR)
  @Get()
  findAll() {
    return this.nurses.findAll();
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
}

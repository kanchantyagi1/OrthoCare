import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { RedFlagRulesService } from './red-flag-rules.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DOCTOR)
@Controller('red-flag-rules')
export class RedFlagRulesController {
  constructor(private readonly rules: RedFlagRulesService) {}

  @Get()
  findAll() {
    return this.rules.findAll();
  }

  @Post()
  create(@Body() body: any) {
    return this.rules.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.rules.update(id, body);
  }
}

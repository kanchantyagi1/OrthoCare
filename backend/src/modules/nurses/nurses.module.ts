import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Nurse } from './entities/nurse.entity';
import { User } from '../users/entities/user.entity';
import { NursesService } from './nurses.service';
import { NursesController } from './nurses.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Nurse, User])],
  providers: [NursesService],
  controllers: [NursesController],
  exports: [NursesService],
})
export class NursesModule {}

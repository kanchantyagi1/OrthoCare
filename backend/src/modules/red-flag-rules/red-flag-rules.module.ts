import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedFlagRule } from './entities/red-flag-rule.entity';
import { RedFlagRulesService } from './red-flag-rules.service';
import { RedFlagRulesController } from './red-flag-rules.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RedFlagRule])],
  providers: [RedFlagRulesService],
  controllers: [RedFlagRulesController],
  exports: [RedFlagRulesService],
})
export class RedFlagRulesModule {}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedFlagRule } from './entities/red-flag-rule.entity';
import { EscalationPriority } from '../../common/enums/escalation.enum';

@Injectable()
export class RedFlagRulesService {
  constructor(@InjectRepository(RedFlagRule) private readonly repo: Repository<RedFlagRule>) {}

  findAll() {
    return this.repo.find();
  }

  create(data: Partial<RedFlagRule>) {
    return this.repo.save(this.repo.create(data));
  }

  update(id: string, data: Partial<RedFlagRule>) {
    return this.repo.save({ id, ...data });
  }

  /**
   * Only approved (status=ACTIVE) red-flag rules can elevate priority (section 35) - the
   * LLM never invents its own red-flag logic, this is a clinic-approved keyword match only.
   */
  async matchPriority(patientMessage: string): Promise<EscalationPriority | null> {
    const rules = await this.repo.find({ where: { status: 'ACTIVE' } });
    const lower = patientMessage.toLowerCase();

    let matched: EscalationPriority | null = null;
    for (const rule of rules) {
      const hit = [...(rule.keywords || []), ...(rule.symptoms || [])].some(
        (term) => term && lower.includes(term.toLowerCase()),
      );
      if (hit) {
        if (rule.priority === EscalationPriority.URGENT) return EscalationPriority.URGENT;
        matched = rule.priority;
      }
    }
    return matched;
  }
}

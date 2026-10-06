import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditEvent } from '../../common/enums/audit-event.enum';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async record(event: AuditEvent, actorUserId?: string, metadata?: Record<string, any>) {
    const log = this.repo.create({ event, actorUserId, metadata });
    return this.repo.save(log);
  }
}

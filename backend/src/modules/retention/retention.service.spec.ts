import { RetentionService } from './retention.service';
import { ChatSession } from '../chat/entities/chat-session.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { Escalation } from '../escalations/entities/escalation.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { Attendance } from '../attendance/entities/attendance.entity';

function deleteChain(affected: number) {
  const qb: any = {
    delete: () => qb,
    where: () => qb,
    andWhere: () => qb,
    execute: async () => ({ affected }),
  };
  return qb;
}

describe('RetentionService.cleanup', () => {
  it('deletes only CLOSED+expired chat sessions, never OPEN ones', async () => {
    const openSession = { id: 'open-1', status: 'OPEN' };
    const expiredClosedSessions = [{ id: 'closed-1', status: 'CLOSED' }];

    const sessionRepo = {
      find: jest.fn(async ({ where }: any) => {
        // Service queries status=CLOSED + lessThan(cutoff) - simulate that filter already applied.
        return expiredClosedSessions;
      }),
      remove: jest.fn(async (rows: any[]) => rows),
    };
    const messageRepo = { createQueryBuilder: jest.fn(() => deleteChain(3)) };
    const escalationRepo = { createQueryBuilder: jest.fn(() => deleteChain(1)) };
    const notificationRepo = { createQueryBuilder: jest.fn(() => deleteChain(2)) };
    const attendanceRepo = { createQueryBuilder: jest.fn(() => deleteChain(0)) };

    const dataSource = {
      getRepository: (entity: any) => {
        if (entity === ChatSession) return sessionRepo;
        if (entity === ChatMessage) return messageRepo;
        if (entity === Escalation) return escalationRepo;
        if (entity === Notification) return notificationRepo;
        if (entity === Attendance) return attendanceRepo;
        throw new Error('unexpected entity');
      },
    };
    const config = { get: () => 30 };
    const audit = { record: jest.fn() };

    const service = new RetentionService(dataSource as any, config as any, audit as any);
    const summary = await service.cleanup();

    expect(sessionRepo.find).toHaveBeenCalled();
    expect(sessionRepo.remove).toHaveBeenCalledWith(expiredClosedSessions);
    expect(summary.deletedChatSessions).toBe(1);
    expect(summary.deletedChatMessages).toBe(3);
    expect(summary.deletedEscalations).toBe(1);
    expect(audit.record).toHaveBeenCalled();
    // The open session must never be part of what gets removed.
    expect(sessionRepo.remove).not.toHaveBeenCalledWith(expect.arrayContaining([openSession]));
  });
});

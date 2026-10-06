import { AttendanceService } from './attendance.service';

function makeRepo(initial: any[] = []) {
  let rows = [...initial];
  let idCounter = 1;
  return {
    data: () => rows,
    findOne: jest.fn(async ({ where }: any) => {
      return (
        rows.find((r) => {
          return Object.entries(where).every(([k, v]) => {
            if (v === null) return r[k] === null || r[k] === undefined;
            return r[k] === v;
          });
        }) || null
      );
    }),
    find: jest.fn(async ({ where }: any = {}) => {
      return rows.filter((r) =>
        Object.entries(where || {}).every(([k, v]) => r[k] === v),
      );
    }),
    create: jest.fn((data: any) => ({ id: `id-${idCounter++}`, ...data })),
    save: jest.fn(async (entity: any) => {
      const idx = rows.findIndex((r) => r.id === entity.id);
      if (idx >= 0) rows[idx] = entity;
      else rows.push(entity);
      return entity;
    }),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        innerJoin: () => qb,
        where: () => qb,
        andWhere: () => qb,
        orderBy: () => qb,
        getMany: async () => rows.filter((r) => r.punchOut === undefined || r.punchOut === null),
      };
      return qb;
    }),
  };
}

const fakeAudit = { record: jest.fn() } as any;

describe('AttendanceService', () => {
  it('punch-in is idempotent (duplicate punch-in does not create a second open record)', async () => {
    const attendanceRepo = makeRepo();
    const nurseRepo = makeRepo();
    const shiftRepo = makeRepo();
    const service = new AttendanceService(attendanceRepo as any, nurseRepo as any, shiftRepo as any, fakeAudit);

    const first = await service.punchIn('nurse-1', {});
    expect(first.duplicate).toBe(false);

    const second = await service.punchIn('nurse-1', {});
    expect(second.duplicate).toBe(true);
    expect(second.attendance.id).toBe(first.attendance.id);
    expect(attendanceRepo.data()).toHaveLength(1);
  });

  it('punch-out is idempotent (duplicate punch-out does not error or double-close)', async () => {
    const attendanceRepo = makeRepo();
    const nurseRepo = makeRepo();
    const shiftRepo = makeRepo();
    const service = new AttendanceService(attendanceRepo as any, nurseRepo as any, shiftRepo as any, fakeAudit);

    await service.punchIn('nurse-1', {});
    const first = await service.punchOut('nurse-1', {});
    expect(first.duplicate).toBe(false);
    expect(first.attendance!.punchOut).toBeInstanceOf(Date);

    const second = await service.punchOut('nurse-1', {});
    expect(second.duplicate).toBe(true);
  });

  it('getCurrentAvailableNurse only returns a nurse who is punched in AND within an active shift window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T10:00:00'));

    const attendanceRepo = makeRepo([
      { id: 'att-1', nurseId: 'nurse-1', punchIn: new Date('2026-01-01T09:00:00'), punchOut: null },
    ]);
    const nurseRepo = makeRepo([{ id: 'nurse-1', isActive: true, userId: 'user-1' }]);
    const shiftRepo = makeRepo([
      { id: 'shift-1', nurseId: 'nurse-1', startTime: '09:00', endTime: '12:00', isActive: true },
    ]);
    const service = new AttendanceService(attendanceRepo as any, nurseRepo as any, shiftRepo as any, fakeAudit);

    const nurse = await service.getCurrentAvailableNurse();
    expect(nurse?.id).toBe('nurse-1');

    jest.useRealTimers();
  });

  it('getCurrentAvailableNurse returns null when the punched-in nurse has no active shift right now', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T20:00:00'));

    const attendanceRepo = makeRepo([
      { id: 'att-1', nurseId: 'nurse-1', punchIn: new Date('2026-01-01T09:00:00'), punchOut: null },
    ]);
    const nurseRepo = makeRepo([{ id: 'nurse-1', isActive: true, userId: 'user-1' }]);
    const shiftRepo = makeRepo([
      { id: 'shift-1', nurseId: 'nurse-1', startTime: '09:00', endTime: '12:00', isActive: true },
    ]);
    const service = new AttendanceService(attendanceRepo as any, nurseRepo as any, shiftRepo as any, fakeAudit);

    const nurse = await service.getCurrentAvailableNurse();
    expect(nurse).toBeNull();

    jest.useRealTimers();
  });
});

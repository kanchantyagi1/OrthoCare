import { FindOperator } from 'typeorm';
import { AttendanceService } from './attendance.service';

/**
 * Matches a where-value the way Postgres via TypeORM actually does.
 *
 * Deliberately NOT lenient about a bare `null`: the previous version of this mock
 * treated `{ punchOut: null }` as "IS NULL", so these tests passed while production
 * was broken - TypeORM drops a raw null condition instead, which made
 * findOpenAttendance match every attendance row. Only an explicit IsNull()
 * FindOperator counts as a null check here, exactly like the real driver.
 */
function matches(actual: any, expected: any): boolean {
  if (expected instanceof FindOperator) {
    if (expected.type === 'isNull') return actual === null || actual === undefined;
    throw new Error(`Unsupported FindOperator in test mock: ${expected.type}`);
  }
  if (expected === null) {
    throw new Error(
      'A raw null in a where clause is not a null check - use IsNull(). ' +
        'See AttendanceService.findOpenAttendance.',
    );
  }
  return actual === expected;
}

function makeRepo(initial: any[] = []) {
  let rows = [...initial];
  let idCounter = 1;
  return {
    data: () => rows,
    findOne: jest.fn(async ({ where }: any) => {
      return rows.find((r) => Object.entries(where).every(([k, v]) => matches(r[k], v))) || null;
    }),
    find: jest.fn(async ({ where }: any = {}) => {
      return rows.filter((r) =>
        Object.entries(where || {}).every(([k, v]) => matches(r[k], v)),
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
    const doctorRepo = makeRepo();
    const shiftRepo = makeRepo();
    const service = new AttendanceService(attendanceRepo as any, doctorRepo as any, shiftRepo as any, fakeAudit);

    const first = await service.punchIn('doctor-1', {});
    expect(first.duplicate).toBe(false);

    const second = await service.punchIn('doctor-1', {});
    expect(second.duplicate).toBe(true);
    expect(second.attendance.id).toBe(first.attendance.id);
    expect(attendanceRepo.data()).toHaveLength(1);
  });

  it('punch-out is idempotent (duplicate punch-out does not error or double-close)', async () => {
    const attendanceRepo = makeRepo();
    const doctorRepo = makeRepo();
    const shiftRepo = makeRepo();
    const service = new AttendanceService(attendanceRepo as any, doctorRepo as any, shiftRepo as any, fakeAudit);

    await service.punchIn('doctor-1', {});
    const first = await service.punchOut('doctor-1', {});
    expect(first.duplicate).toBe(false);
    expect(first.attendance!.punchOut).toBeInstanceOf(Date);

    const second = await service.punchOut('doctor-1', {});
    expect(second.duplicate).toBe(true);
  });

  // The reported bug: a doctor who punched out could never punch back in, because
  // findOpenAttendance matched the already-closed row and reported "already punched in".
  it('allows punching in again after a punch-out, as a NEW attendance record', async () => {
    const attendanceRepo = makeRepo();
    const doctorRepo = makeRepo();
    const shiftRepo = makeRepo();
    const service = new AttendanceService(attendanceRepo as any, doctorRepo as any, shiftRepo as any, fakeAudit);

    const firstIn = await service.punchIn('doctor-1', {});
    await service.punchOut('doctor-1', {});

    const secondIn = await service.punchIn('doctor-1', {});

    expect(secondIn.duplicate).toBe(false);
    expect(secondIn.attendance.id).not.toBe(firstIn.attendance.id);
    expect(secondIn.attendance.punchOut).toBeUndefined();
    expect(attendanceRepo.data()).toHaveLength(2);

    // ...and a third cycle, to prove it is not just the second one that works.
    await service.punchOut('doctor-1', {});
    const thirdIn = await service.punchIn('doctor-1', {});
    expect(thirdIn.duplicate).toBe(false);
    expect(attendanceRepo.data()).toHaveLength(3);
  });

  it('today() status agrees with its own records (ACTIVE only while a punch is open)', async () => {
    const attendanceRepo = makeRepo();
    const doctorRepo = makeRepo();
    const shiftRepo = makeRepo();
    const service = new AttendanceService(attendanceRepo as any, doctorRepo as any, shiftRepo as any, fakeAudit);

    expect((await service.today('doctor-1')).status).toBe('OFFLINE');

    await service.punchIn('doctor-1', {});
    const whilePunchedIn = await service.today('doctor-1');
    expect(whilePunchedIn.status).toBe('ACTIVE');
    expect(whilePunchedIn.records.length).toBeGreaterThan(0);

    await service.punchOut('doctor-1', {});
    // Previously reported ACTIVE with zero open records - a contradiction that came
    // from the status check and the record query disagreeing about punch_out.
    expect((await service.today('doctor-1')).status).toBe('OFFLINE');
  });

  it('getCurrentAvailableDoctor only returns a doctor who is punched in AND within an active shift window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T10:00:00'));

    const attendanceRepo = makeRepo([
      { id: 'att-1', doctorId: 'doctor-1', punchIn: new Date('2026-01-01T09:00:00'), punchOut: null },
    ]);
    const doctorRepo = makeRepo([{ id: 'doctor-1', isActive: true, userId: 'user-1' }]);
    const shiftRepo = makeRepo([
      { id: 'shift-1', doctorId: 'doctor-1', startTime: '09:00', endTime: '12:00', isActive: true },
    ]);
    const service = new AttendanceService(attendanceRepo as any, doctorRepo as any, shiftRepo as any, fakeAudit);

    const doctor = await service.getCurrentAvailableDoctor();
    expect(doctor?.id).toBe('doctor-1');

    jest.useRealTimers();
  });

  it('getCurrentAvailableDoctor returns null when the punched-in doctor has no active shift right now', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T20:00:00'));

    const attendanceRepo = makeRepo([
      { id: 'att-1', doctorId: 'doctor-1', punchIn: new Date('2026-01-01T09:00:00'), punchOut: null },
    ]);
    const doctorRepo = makeRepo([{ id: 'doctor-1', isActive: true, userId: 'user-1' }]);
    const shiftRepo = makeRepo([
      { id: 'shift-1', doctorId: 'doctor-1', startTime: '09:00', endTime: '12:00', isActive: true },
    ]);
    const service = new AttendanceService(attendanceRepo as any, doctorRepo as any, shiftRepo as any, fakeAudit);

    const doctor = await service.getCurrentAvailableDoctor();
    expect(doctor).toBeNull();

    jest.useRealTimers();
  });
});

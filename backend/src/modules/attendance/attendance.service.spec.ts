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

  /**
   * These pin the timezone bug that left every escalation unassigned: shift windows
   * are clinic wall-clock, but the code read the SERVER's clock, and the deployed host
   * runs UTC. A 07:00-12:00 IST shift was therefore only "active" 07:00-12:00 UTC.
   *
   * Written against a fixed UTC instant and an explicitly configured clinic zone, so
   * they do not depend on the machine's own timezone - the previous versions used a
   * local-time literal and so passed on an IST laptop whichever clock the code read.
   */
  describe('getCurrentAvailableDoctor shift windows (clinic timezone)', () => {
    // 03:30Z == 09:00 IST, which is inside a 07:00-12:00 clinic shift but outside it
    // when the same instant is read as UTC.
    const DURING_IST_SHIFT = new Date('2026-07-01T03:30:00Z');

    const fakeConfig = (timeZone: string) =>
      ({ get: (key: string) => (key === 'clinic.timeZone' ? timeZone : undefined) }) as any;

    function serviceFor(timeZone: string) {
      const attendanceRepo = makeRepo([
        { id: 'att-1', doctorId: 'doctor-1', punchIn: new Date('2026-07-01T03:00:00Z'), punchOut: null },
      ]);
      const doctorRepo = makeRepo([{ id: 'doctor-1', isActive: true, userId: 'user-1' }]);
      const shiftRepo = makeRepo([
        { id: 'shift-1', doctorId: 'doctor-1', startTime: '07:00', endTime: '12:00', isActive: true },
      ]);
      return new AttendanceService(
        attendanceRepo as any,
        doctorRepo as any,
        shiftRepo as any,
        fakeAudit,
        fakeConfig(timeZone),
      );
    }

    afterEach(() => jest.useRealTimers());

    it('finds the doctor when it is 09:00 in the CLINIC zone, even though the clock reads 03:30 UTC', async () => {
      jest.useFakeTimers().setSystemTime(DURING_IST_SHIFT);
      expect((await serviceFor('Asia/Kolkata').getCurrentAvailableDoctor())?.id).toBe('doctor-1');
    });

    it('finds nobody for the SAME instant when the clinic is in UTC, proving the zone is what decides', async () => {
      jest.useFakeTimers().setSystemTime(DURING_IST_SHIFT);
      // Same clock, same shift, same punch-in - only the configured zone differs, so a
      // difference here can only come from the conversion, not from the host clock.
      expect(await serviceFor('UTC').getCurrentAvailableDoctor()).toBeNull();
    });

    it('returns null at 02:00 clinic time, outside the 07:00-12:00 window', async () => {
      // 20:30Z == 02:00 IST the next day.
      jest.useFakeTimers().setSystemTime(new Date('2026-06-30T20:30:00Z'));
      expect(await serviceFor('Asia/Kolkata').getCurrentAvailableDoctor()).toBeNull();
    });

    it('still requires a punch-in, not just an active shift', async () => {
      jest.useFakeTimers().setSystemTime(DURING_IST_SHIFT);
      const attendanceRepo = makeRepo([
        {
          id: 'att-1',
          doctorId: 'doctor-1',
          punchIn: new Date('2026-07-01T02:00:00Z'),
          punchOut: new Date('2026-07-01T03:00:00Z'),
        },
      ]);
      const service = new AttendanceService(
        attendanceRepo as any,
        makeRepo([{ id: 'doctor-1', isActive: true, userId: 'user-1' }]) as any,
        makeRepo([
          { id: 'shift-1', doctorId: 'doctor-1', startTime: '07:00', endTime: '12:00', isActive: true },
        ]) as any,
        fakeAudit,
        fakeConfig('Asia/Kolkata'),
      );
      expect(await service.getCurrentAvailableDoctor()).toBeNull();
    });
  });
});

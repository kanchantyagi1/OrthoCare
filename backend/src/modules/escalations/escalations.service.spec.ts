import { FindOperator } from 'typeorm';
import { EscalationsService } from './escalations.service';
import { EscalationPriority, EscalationStatus } from '../../common/enums/escalation.enum';

function matchesValue(actual: any, expected: any): boolean {
  if (expected instanceof FindOperator) {
    if (expected.type === 'isNull') return actual === null || actual === undefined;
    throw new Error(`Unsupported FindOperator in test mock: ${expected.type}`);
  }
  return actual === expected;
}

/** A where-object matches on every key; an ARRAY of where-objects is an OR. */
function matchesWhere(row: any, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where)) return where.some((w) => matchesWhere(row, w));
  return Object.entries(where).every(([k, v]) => matchesValue(row[k], v));
}

function fakeEscalationRepo(initial: any[] = []) {
  const rows: any[] = [...initial];
  let idCounter = 1;
  return {
    rows,
    create: jest.fn((data: any) => ({ id: `esc-${idCounter++}`, ...data })),
    save: jest.fn(async (entity: any) => {
      const idx = rows.findIndex((r) => r.id === entity.id);
      if (idx >= 0) rows[idx] = entity;
      else rows.push(entity);
      return entity;
    }),
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => matchesWhere(r, where)) || null),
    find: jest.fn(async ({ where }: any = {}) => rows.filter((r) => matchesWhere(r, where))),
    /**
     * Models the conditional UPDATE that makes claiming race-safe: the guards live in
     * the WHERE, so a second concurrent claim matches zero rows rather than silently
     * overwriting the first doctor's assignment.
     */
    createQueryBuilder: jest.fn(() => {
      let setValues: any = {};
      let targetId: string | undefined;
      let requireUnassigned = false;
      let requireStatus: string | undefined;

      const qb: any = {
        update: () => qb,
        set: (v: any) => {
          setValues = v;
          return qb;
        },
        where: (_clause: string, params?: any) => {
          if (params?.id) targetId = params.id;
          return qb;
        },
        andWhere: (clause: string, params?: any) => {
          if (/assigned_doctor_id\s+IS\s+NULL/i.test(clause)) requireUnassigned = true;
          if (/status\s*=\s*:waiting/i.test(clause)) requireStatus = params?.waiting;
          return qb;
        },
        execute: async () => {
          const row = rows.find((r) => r.id === targetId);
          if (!row) return { affected: 0 };
          if (requireUnassigned && row.assignedDoctorId) return { affected: 0 };
          if (requireStatus !== undefined && row.status !== requireStatus) return { affected: 0 };
          Object.assign(row, setValues);
          return { affected: 1 };
        },
      };
      return qb;
    }),
  };
}

const fakeNotesRepo = { create: jest.fn((d: any) => d), save: jest.fn(async (d: any) => d) };
const fakeAudit = { record: jest.fn() };

describe('EscalationsService', () => {
  it('assigns the escalation to the current available doctor and notifies them', async () => {
    const escalationRepo = fakeEscalationRepo();
    const attendance = { getCurrentAvailableDoctor: jest.fn(async () => ({ id: 'doctor-1', userId: 'user-1' })) };
    const notifications = {
      notifyEscalationAssigned: jest.fn(async () => ({})),
      notifyAdminsNoDoctorAvailable: jest.fn(async () => {}),
    };
    const users = {
      findByRole: jest.fn(async () => []),
      findById: jest.fn(async () => ({ id: 'user-1', fullName: 'Priya' })),
    };
    const doctors = {};
    const patients = { findOne: jest.fn(async () => ({ id: 'patient-1', user: { fullName: 'Rahul' } })) };

    const service = new EscalationsService(
      escalationRepo as any,
      fakeNotesRepo as any,
      attendance as any,
      notifications as any,
      users as any,
      doctors as any,
      patients as any,
      fakeAudit as any,
    );

    const result = await service.create({
      patientId: 'patient-1',
      question: 'Severe pain in my leg',
      reason: 'red_flag_rule_matched',
      priority: EscalationPriority.URGENT,
    });

    expect(result.status).toBe(EscalationStatus.ASSIGNED);
    expect(result.assignedDoctorId).toBe('doctor-1');
    expect(notifications.notifyEscalationAssigned).toHaveBeenCalled();
  });

  it('leaves the escalation WAITING_FOR_DOCTOR and notifies admins when no doctor is available', async () => {
    const escalationRepo = fakeEscalationRepo();
    const attendance = { getCurrentAvailableDoctor: jest.fn(async () => null) };
    const notifications = {
      notifyEscalationAssigned: jest.fn(async () => ({})),
      notifyAdminsNoDoctorAvailable: jest.fn(async () => {}),
    };
    const users = { findByRole: jest.fn(async () => [{ id: 'admin-1' }]), findById: jest.fn() };
    const doctors = {};
    const patients = { findOne: jest.fn(async () => ({ id: 'patient-1', user: { fullName: 'Rahul' } })) };

    const service = new EscalationsService(
      escalationRepo as any,
      fakeNotesRepo as any,
      attendance as any,
      notifications as any,
      users as any,
      doctors as any,
      patients as any,
      fakeAudit as any,
    );

    const result = await service.create({
      patientId: 'patient-1',
      question: 'Not helpful answer',
      reason: 'patient_marked_not_helpful',
    });

    expect(result.status).toBe(EscalationStatus.WAITING_FOR_DOCTOR);
    expect(result.assignedDoctorId).toBeUndefined();
    expect(notifications.notifyAdminsNoDoctorAvailable).toHaveBeenCalledWith([{ id: 'admin-1' }], result.id);
  });

  /**
   * The reported bug: a case raised while nobody was punched in is WAITING_FOR_DOCTOR
   * with no assignee. Filtering a doctor's list purely on assignment hid it from every
   * doctor, while the patient's own screen still showed it pending - so it rotted.
   */
  describe('unassigned case queue', () => {
    const waitingCase = {
      id: 'esc-waiting',
      patientId: 'patient-9',
      status: EscalationStatus.WAITING_FOR_DOCTOR,
      assignedDoctorId: null,
      createdAt: new Date('2026-07-01T03:00:00Z'),
    };
    const minePrevious = {
      id: 'esc-mine',
      patientId: 'patient-8',
      status: EscalationStatus.CONTACTED,
      assignedDoctorId: 'doctor-1',
      createdAt: new Date('2026-07-01T02:00:00Z'),
    };
    const someoneElses = {
      id: 'esc-theirs',
      patientId: 'patient-7',
      status: EscalationStatus.ASSIGNED,
      assignedDoctorId: 'doctor-2',
      createdAt: new Date('2026-07-01T01:00:00Z'),
    };

    function makeService(repo: ReturnType<typeof fakeEscalationRepo>) {
      return new EscalationsService(
        repo as any,
        fakeNotesRepo as any,
        { getCurrentAvailableDoctor: jest.fn(async () => null) } as any,
        {
          notifyEscalationAssigned: jest.fn(async () => ({})),
          notifyAdminsNoDoctorAvailable: jest.fn(async () => {}),
        } as any,
        { findByRole: jest.fn(async () => []), findById: jest.fn() } as any,
        { findOne: jest.fn(async (id: string) => ({ id, user: { fullName: 'Dr Who' } })) } as any,
        { findOne: jest.fn(async () => null) } as any,
        fakeAudit as any,
      );
    }

    it("includes unassigned waiting cases in a doctor's list, but never another doctor's cases", async () => {
      const repo = fakeEscalationRepo([waitingCase, minePrevious, someoneElses]);
      const ids = (
        await makeService(repo).findAll({ doctorId: 'doctor-1', includeUnassignedQueue: true })
      ).map((e: any) => e.id);

      expect(ids).toContain('esc-waiting');
      expect(ids).toContain('esc-mine');
      expect(ids).not.toContain('esc-theirs');
    });

    it('omits the queue when not asked for it (admin/legacy behaviour is unchanged)', async () => {
      const repo = fakeEscalationRepo([waitingCase, minePrevious]);
      const ids = (await makeService(repo).findAll({ doctorId: 'doctor-1' })).map((e: any) => e.id);

      expect(ids).toEqual(['esc-mine']);
    });

    it('claiming assigns the case to the calling doctor and moves it out of the queue', async () => {
      const repo = fakeEscalationRepo([{ ...waitingCase }]);
      const service = makeService(repo);

      await service.claim('esc-waiting', 'doctor-1');

      const row = repo.rows.find((r) => r.id === 'esc-waiting');
      expect(row.assignedDoctorId).toBe('doctor-1');
      expect(row.status).toBe(EscalationStatus.ASSIGNED);
      expect(row.assignedAt).toBeInstanceOf(Date);
    });

    it('refuses a second claim instead of silently reassigning (only one doctor wins)', async () => {
      const repo = fakeEscalationRepo([{ ...waitingCase }]);
      const service = makeService(repo);

      await service.claim('esc-waiting', 'doctor-1');
      await expect(service.claim('esc-waiting', 'doctor-2')).rejects.toThrow(
        /already been claimed/i,
      );

      expect(repo.rows.find((r) => r.id === 'esc-waiting').assignedDoctorId).toBe('doctor-1');
    });

    it('claiming a non-existent case is a not-found, not a conflict', async () => {
      const service = makeService(fakeEscalationRepo([]));
      await expect(service.claim('esc-nope', 'doctor-1')).rejects.toThrow(/not found/i);
    });

    it('punch-in sweeps every waiting case to the doctor coming on duty', async () => {
      const repo = fakeEscalationRepo([
        { ...waitingCase },
        { ...waitingCase, id: 'esc-waiting-2' },
        { ...someoneElses },
      ]);
      const service = makeService(repo);

      expect(await service.assignWaitingCasesTo('doctor-1')).toBe(2);

      expect(repo.rows.find((r) => r.id === 'esc-waiting').assignedDoctorId).toBe('doctor-1');
      expect(repo.rows.find((r) => r.id === 'esc-waiting-2').assignedDoctorId).toBe('doctor-1');
      // Another doctor's case is untouched by the sweep.
      expect(repo.rows.find((r) => r.id === 'esc-theirs').assignedDoctorId).toBe('doctor-2');
    });

    it('a sweep with nothing waiting is a no-op', async () => {
      const service = makeService(fakeEscalationRepo([{ ...someoneElses }]));
      expect(await service.assignWaitingCasesTo('doctor-1')).toBe(0);
    });
  });
});

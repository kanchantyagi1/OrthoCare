import { Doctor } from './entities/doctor.entity';
import { User } from '../users/entities/user.entity';
import { DoctorsService } from './doctors.service';

/**
 * Reported bug: a removed doctor "still shows everywhere, even in Shift
 * Management." DELETE /doctors/:id always deactivated correctly, but
 * listForAdmin() returned every doctor regardless of isActive, and nothing
 * touched their shifts - so the deactivation flag was set but never acted on.
 */
function makeRepo(rows: any[]) {
  return {
    data: () => rows,
    find: jest.fn(async ({ where }: any = {}) => {
      const conditions = Object.entries(where || {});
      return rows.filter((r) => conditions.every(([k, v]) => r[k] === v));
    }),
    findOne: jest.fn(async ({ where }: any) => {
      return rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) || null;
    }),
    update: jest.fn(async (where: any, patch: any) => {
      const key = Object.keys(where)[0];
      rows.filter((r) => r[key] === where[key]).forEach((r) => Object.assign(r, patch));
    }),
  };
}

describe('DoctorsService', () => {
  function build() {
    const doctorRows = [{ id: 'doctor-1', userId: 'user-1', isActive: true }];
    const userRows = [{ id: 'user-1', isActive: true, fullName: 'Dr Test' }];
    const shiftRows = [
      { id: 'shift-1', doctorId: 'doctor-1', isActive: true, startTime: '09:00', endTime: '12:00' },
    ];

    const doctorRepo = makeRepo(doctorRows) as any;
    const userRepo = makeRepo(userRows);
    const shiftRepo = makeRepo(shiftRows);

    // DoctorsService.deactivate() runs its three updates via
    // `this.repo.manager.transaction(...)`. The in-memory stores above are a single
    // shared process, so a plain sequential apply is an adequate stand-in for a real
    // transaction here - this test is checking "all three rows were updated
    // together", not Postgres transaction semantics.
    doctorRepo.manager = {
      transaction: async (fn: (manager: any) => Promise<void>) => {
        const manager = {
          update: async (entityClass: any, where: any, patch: any) => {
            const targetRepo = entityClass === Doctor ? doctorRepo : entityClass === User ? userRepo : shiftRepo;
            await targetRepo.update(where, patch);
          },
        };
        await fn(manager);
      },
    };

    const service = new DoctorsService(doctorRepo, userRepo as any, shiftRepo as any);
    return { service, doctorRepo, userRepo, shiftRepo };
  }

  it('listForAdmin excludes a removed (deactivated) doctor by default', async () => {
    const { service, doctorRepo } = build();
    doctorRepo.data().push({ id: 'doctor-2', userId: 'user-2', isActive: false });

    const list = await service.listForAdmin();
    expect(list.map((d) => d.id)).toEqual(['doctor-1']);
  });

  it('listForAdmin(true) includes removed doctors, for restoring them', async () => {
    const { service, doctorRepo } = build();
    doctorRepo.data().push({ id: 'doctor-2', userId: 'user-2', isActive: false });

    const list = await service.listForAdmin(true);
    expect(list.map((d) => d.id).sort()).toEqual(['doctor-1', 'doctor-2']);
  });

  it('deactivate() deactivates the doctor, their user account, AND their shifts', async () => {
    const { service, doctorRepo, userRepo, shiftRepo } = build();

    await service.deactivate('doctor-1');

    expect(doctorRepo.data().find((d: any) => d.id === 'doctor-1').isActive).toBe(false);
    expect(userRepo.data().find((u: any) => u.id === 'user-1').isActive).toBe(false);
    expect(shiftRepo.data().find((s: any) => s.id === 'shift-1').isActive).toBe(false);
  });

  it('re-activating a doctor does NOT resurrect their old shifts', async () => {
    const { service, shiftRepo } = build();

    await service.deactivate('doctor-1');
    expect(shiftRepo.data().find((s: any) => s.id === 'shift-1').isActive).toBe(false);

    await service.setActive('doctor-1', true);

    // setActive only ever touches the doctor row - the shift stays deactivated,
    // deliberately: an admin recreates shifts for a returning doctor.
    expect(shiftRepo.data().find((s: any) => s.id === 'shift-1').isActive).toBe(false);
  });
});

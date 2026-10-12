import { ConflictException } from '@nestjs/common';
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
    create: jest.fn((patch: any) => ({ ...patch })),
    save: jest.fn(async (entity: any) => {
      const withId = { id: entity.id || `generated-${rows.length + 1}`, ...entity };
      rows.push(withId);
      return withId;
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

/**
 * Reported bug: "Save works on one phone, not on the other." The Save button had no
 * error handling at all, so a rejected create - most often a reused email address -
 * threw silently: the dialog never closed and nothing told the admin why. The app
 * fix (showing the thrown message) only helps if the backend gives a clear message
 * instead of the raw unique-constraint violation, which these tests cover.
 */
describe('DoctorsService.create', () => {
  function build() {
    const doctorRows: any[] = [];
    const userRows: any[] = [];
    const doctorRepo = makeRepo(doctorRows) as any;
    const userRepo = makeRepo(userRows) as any;
    const shiftRepo = makeRepo([]) as any;
    // deactivate() runs through repo.manager.transaction() - see the shared note
    // on the identical stand-in above.
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
    const service = new DoctorsService(doctorRepo, userRepo, shiftRepo);
    return { service, doctorRepo, userRepo };
  }

  it('creates the user (role=doctor) and doctor profile for a new email', async () => {
    const { service, userRepo, doctorRepo } = build();

    await service.create({ email: 'new.doc@clinic.test', password: 'secret1', fullName: 'Dr New' });

    expect(userRepo.data()).toHaveLength(1);
    expect(userRepo.data()[0].email).toBe('new.doc@clinic.test');
    expect(userRepo.data()[0].role).toBe('doctor');
    expect(doctorRepo.data()).toHaveLength(1);
    expect(doctorRepo.data()[0].userId).toBe(userRepo.data()[0].id);
  });

  it('rejects a second doctor created with an email already in use, with a clear message', async () => {
    const { service, userRepo, doctorRepo } = build();
    await service.create({ email: 'dupe@clinic.test', password: 'secret1', fullName: 'Dr First' });

    await expect(
      service.create({ email: 'dupe@clinic.test', password: 'secret2', fullName: 'Dr Second' }),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.create({ email: 'dupe@clinic.test', password: 'secret2', fullName: 'Dr Second' }),
    ).rejects.toThrow('An account with this email already exists.');

    // The rejected attempt must not have created a second user or doctor row.
    expect(userRepo.data()).toHaveLength(1);
    expect(doctorRepo.data()).toHaveLength(1);
  });

  it('reactivates a removed doctor instead of rejecting a re-add with their old email', async () => {
    const { service, userRepo, doctorRepo } = build();
    const created = (await service.create({ email: 'returning@clinic.test', password: 'secret1', fullName: 'Dr Old Name' }))!;
    await service.deactivate(created.id);
    expect(userRepo.data()[0].isActive).toBe(false);
    expect(doctorRepo.data()[0].isActive).toBe(false);

    const result = await service.create({
      email: 'returning@clinic.test',
      password: 'secret2',
      fullName: 'Dr New Name',
      phone: '9999999999',
    });

    // Same rows reactivated, not a duplicate created alongside them.
    expect(userRepo.data()).toHaveLength(1);
    expect(doctorRepo.data()).toHaveLength(1);
    expect(result!.id).toBe(created.id);
    expect(userRepo.data()[0].isActive).toBe(true);
    expect(userRepo.data()[0].fullName).toBe('Dr New Name');
    expect(userRepo.data()[0].phone).toBe('9999999999');
    expect(doctorRepo.data()[0].isActive).toBe(true);
  });
});

import { ShiftsService } from './shifts.service';

/**
 * Reported bug: a removed doctor's shifts kept appearing in Shift Management.
 * DoctorsService.deactivate() now deactivates the doctor's shifts too (see
 * doctors.service.spec.ts), but listForApi() must also filter them out itself -
 * belt and braces against any other path that deactivates a doctor without
 * going through DoctorsService.
 */
function makeQueryBuilderRepo(shiftRows: any[]) {
  return {
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        innerJoinAndSelect: () => qb,
        leftJoinAndSelect: () => qb,
        where: () => qb,
        andWhere: () => qb,
        orderBy: () => qb,
        getMany: async () =>
          shiftRows.filter((s) => s.isActive && s.doctor?.isActive),
      };
      return qb;
    }),
  };
}

describe('ShiftsService.listForApi', () => {
  it('excludes a shift whose shift row itself is inactive', async () => {
    const repo = makeQueryBuilderRepo([
      {
        id: 'shift-1',
        doctorId: 'doctor-1',
        isActive: false,
        startTime: '09:00',
        endTime: '12:00',
        doctor: { isActive: true, user: { fullName: 'Dr Active' } },
      },
    ]);
    const service = new ShiftsService(repo as any);

    expect(await service.listForApi()).toEqual([]);
  });

  it("excludes a shift belonging to an inactive (removed) doctor", async () => {
    const repo = makeQueryBuilderRepo([
      {
        id: 'shift-1',
        doctorId: 'doctor-1',
        isActive: true,
        startTime: '09:00',
        endTime: '12:00',
        doctor: { isActive: false, user: { fullName: 'Dr Removed' } },
      },
    ]);
    const service = new ShiftsService(repo as any);

    expect(await service.listForApi()).toEqual([]);
  });

  it('includes a shift for an active doctor that is itself active', async () => {
    const repo = makeQueryBuilderRepo([
      {
        id: 'shift-1',
        doctorId: 'doctor-1',
        isActive: true,
        startTime: '09:00',
        endTime: '12:00',
        label: null,
        doctor: { isActive: true, user: { fullName: 'Dr Active' } },
      },
    ]);
    const service = new ShiftsService(repo as any);

    const result = await service.listForApi();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'shift-1', doctorName: 'Dr Active' });
  });
});

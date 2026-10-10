import { EscalationsService } from './escalations.service';
import { EscalationPriority, EscalationStatus } from '../../common/enums/escalation.enum';

function fakeEscalationRepo() {
  const rows: any[] = [];
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
    findOne: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id) || null),
    find: jest.fn(async () => rows),
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
});

import { NotificationsService } from './notifications.service';
import { EscalationPriority } from '../../common/enums/escalation.enum';

function fakeNotificationRepo() {
  const rows: any[] = [];
  let idCounter = 1;
  return {
    rows,
    create: jest.fn((data: any) => ({ id: `notif-${idCounter++}`, ...data })),
    save: jest.fn(async (entity: any) => {
      const idx = rows.findIndex((r) => r.id === entity.id);
      if (idx >= 0) rows[idx] = entity;
      else rows.push(entity);
      return entity;
    }),
  };
}

describe('NotificationsService - FCM failure handling', () => {
  it('records the notification as FAILED with a reason when the push send fails, without throwing', async () => {
    const notifications = fakeNotificationRepo();
    const fcm = {
      send: jest.fn(async () => ({ success: false, mocked: false, error: 'messaging/invalid-registration-token' })),
    };

    const service = new NotificationsService(notifications as any, fcm as any);

    const result = await service.notifyEscalationAssigned({
      doctorUser: { id: 'user-1', fcmToken: 'stale-token' } as any,
      patientName: 'Rahul',
      priority: EscalationPriority.NORMAL,
      escalationId: 'esc-1',
    });

    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toBe('messaging/invalid-registration-token');
  });

  it('records MOCKED (not an error state) when running in FCM mock mode', async () => {
    const notifications = fakeNotificationRepo();
    const fcm = { send: jest.fn(async () => ({ success: true, mocked: true })) };
    const service = new NotificationsService(notifications as any, fcm as any);

    const result = await service.notifyEscalationAssigned({
      doctorUser: { id: 'user-1' } as any,
      patientName: 'Rahul',
      priority: EscalationPriority.URGENT,
      escalationId: 'esc-2',
    });

    expect(result.status).toBe('MOCKED');
    expect(result.title).toBe('URGENT PATIENT QUERY');
  });

  it('continues notifying remaining admins even if one admin send fails', async () => {
    const notifications = fakeNotificationRepo();
    let call = 0;
    const fcm = {
      send: jest.fn(async () => {
        call++;
        if (call === 1) return { success: false, mocked: false, error: 'network_error' };
        return { success: true, mocked: true };
      }),
    };
    const service = new NotificationsService(notifications as any, fcm as any);

    await service.notifyAdminsNoDoctorAvailable(
      [{ id: 'admin-1' } as any, { id: 'admin-2' } as any],
      'esc-3',
    );

    expect(fcm.send).toHaveBeenCalledTimes(2);
    expect(notifications.rows).toHaveLength(2);
    expect(notifications.rows[0].status).toBe('FAILED');
    expect(notifications.rows[1].status).toBe('MOCKED');
  });
});

import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { EscalationsService } from '../escalations/escalations.service';

/**
 * Patients have no account: a chat session id is their ONLY credential. These tests
 * pin the resulting security property - possessing one patient's session id must
 * never expose another patient's conversation or escalations.
 */

const SESSION_A = '11111111-1111-4111-8111-111111111111'; // belongs to patient-a
const SESSION_B = '22222222-2222-4222-8222-222222222222'; // belongs to patient-b
const UNKNOWN_SESSION = '33333333-3333-4333-8333-333333333333';

const sessions = [
  { id: SESSION_A, patientId: 'patient-a', createdAt: new Date('2026-01-01T10:00:00Z') },
  { id: SESSION_B, patientId: 'patient-b', createdAt: new Date('2026-01-02T10:00:00Z') },
];

function fakeSessionRepo() {
  return {
    findOne: jest.fn(async ({ where }: any) => sessions.find((s) => s.id === where.id) || null),
    find: jest.fn(async ({ where }: any) =>
      sessions.filter((s) => s.patientId === where.patientId),
    ),
    save: jest.fn(async (s: any) => s),
    create: jest.fn((d: any) => d),
  };
}

const messages = [
  { id: 'msg-a', sessionId: SESSION_A, role: 'assistant', message: 'Answer for A', createdAt: new Date() },
  { id: 'msg-b', sessionId: SESSION_B, role: 'assistant', message: 'Answer for B', createdAt: new Date() },
];

function fakeMessageRepo() {
  return {
    findOne: jest.fn(async ({ where }: any) => messages.find((m) => m.id === where.id) || null),
    find: jest.fn(async ({ where }: any) => messages.filter((m) => m.sessionId === where.sessionId)),
    save: jest.fn(async (m: any) => m),
    create: jest.fn((d: any) => d),
  };
}

const config = { get: (_k: string, d?: any) => d } as unknown as ConfigService;

function makeChatService(sessionRepo: any, messageRepo: any, escalations: any = { create: jest.fn() }) {
  return new ChatService(
    sessionRepo,
    messageRepo,
    {} as any,
    {} as any,
    {} as any,
    escalations,
    {} as any,
    { record: jest.fn() } as any,
    config,
  );
}

describe('account-less patient session scoping (chat)', () => {
  it('rejects an unknown session id instead of falling back to any patient', async () => {
    const service = makeChatService(fakeSessionRepo(), fakeMessageRepo());
    await expect(service.getSessionOrThrowById(UNKNOWN_SESSION)).rejects.toThrow(NotFoundException);
  });

  it('returns only the owning patient history for a given session id', async () => {
    const service = makeChatService(fakeSessionRepo(), fakeMessageRepo());

    const session = await service.getSessionOrThrowById(SESSION_A);
    expect(session.patientId).toBe('patient-a');

    const history = await service.history(session.patientId);
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(SESSION_A);
    // patient-b's session must not leak into patient-a's history
    expect(history.map((h) => h.id)).not.toContain(SESSION_B);
  });

  it('returns only that session\'s messages', async () => {
    const service = makeChatService(fakeSessionRepo(), fakeMessageRepo());
    const msgs = await service.messagesForSession(SESSION_A);
    expect(msgs.map((m: any) => m.id)).toEqual(['msg-a']);
  });

  it('refuses feedback on a message belonging to a different patient\'s session', async () => {
    const service = makeChatService(fakeSessionRepo(), fakeMessageRepo());

    // Patient A holds SESSION_A but targets patient B's message id.
    await expect(
      service.submitFeedbackForSession('patient-a', SESSION_A, 'msg-b', false),
    ).rejects.toThrow(NotFoundException);
  });

  it('allows feedback on a message inside the caller\'s own session', async () => {
    const escalations = { create: jest.fn(async () => ({})) };
    const service = makeChatService(fakeSessionRepo(), fakeMessageRepo(), escalations);

    const result = await service.submitFeedbackForSession('patient-a', SESSION_A, 'msg-a', true);
    expect(result.helpful).toBe(true);
  });

  it('enforces the daily per-patient message cap', async () => {
    const messageRepo: any = fakeMessageRepo();
    messageRepo.createQueryBuilder = jest.fn(() => ({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn(async () => 40), // already at the default cap
    }));
    const cappedConfig = {
      get: (key: string, d?: any) => (key === 'patientLimits.dailyMessageCap' ? 40 : d),
    } as unknown as ConfigService;

    const service = new ChatService(
      fakeSessionRepo() as any,
      messageRepo,
      {} as any,
      {} as any,
      {} as any,
      { create: jest.fn() } as any,
      {} as any,
      { record: jest.fn() } as any,
      cappedConfig,
    );

    await expect(service.assertDailyQuotaRemaining('patient-a')).rejects.toThrow(
      /daily limit/i,
    );
  });
});

describe('account-less patient session scoping (escalations)', () => {
  function makeEscalationsService(escalationRows: any[]) {
    const escalationRepo = {
      find: jest.fn(async ({ where }: any) =>
        escalationRows.filter((e) => !where.patientId || e.patientId === where.patientId),
      ),
      findOne: jest.fn(async ({ where }: any) => escalationRows.find((e) => e.id === where.id) || null),
      save: jest.fn(async (e: any) => e),
      create: jest.fn((d: any) => d),
    };
    const patients = {
      findOne: jest.fn(async (id: string) => ({
        id,
        fullName: id === 'patient-a' ? 'Patient A' : 'Patient B',
        phone: id === 'patient-a' ? '9000000001' : '9000000002',
      })),
    };
    const service = new EscalationsService(
      escalationRepo as any,
      { create: jest.fn(), save: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      { findOne: jest.fn(async () => null) } as any,
      patients as any,
      { record: jest.fn() } as any,
      undefined, // messageRepo - no sources in this test
      undefined, // chunkRepo
      fakeSessionRepo() as any,
    );
    return { service, escalationRepo };
  }

  const rows = [
    {
      id: 'esc-a',
      patientId: 'patient-a',
      question: 'A question',
      priority: 'normal',
      status: 'WAITING_FOR_NURSE',
      createdAt: new Date(),
    },
    {
      id: 'esc-b',
      patientId: 'patient-b',
      question: 'B question',
      priority: 'normal',
      status: 'WAITING_FOR_NURSE',
      createdAt: new Date(),
    },
  ];

  it('resolves a session id to its own patient only', async () => {
    const { service } = makeEscalationsService(rows);
    await expect(service.resolvePatientIdFromSession(SESSION_A)).resolves.toBe('patient-a');
    await expect(service.resolvePatientIdFromSession(SESSION_B)).resolves.toBe('patient-b');
  });

  it('rejects an unknown session id rather than returning everything', async () => {
    const { service } = makeEscalationsService(rows);
    await expect(service.resolvePatientIdFromSession(UNKNOWN_SESSION)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('never returns another patient\'s escalation for a given session', async () => {
    const { service } = makeEscalationsService(rows);

    const patientId = await service.resolvePatientIdFromSession(SESSION_A);
    const views = await service.findAllViews({ patientId });

    expect(views.map((v) => v.id)).toEqual(['esc-a']);
    expect(views.map((v) => v.id)).not.toContain('esc-b');
    // The nurse-facing payload must carry a callable number for the right patient.
    expect(views[0].patientPhone).toBe('9000000001');
    expect(views[0].patientName).toBe('Patient A');
  });
});

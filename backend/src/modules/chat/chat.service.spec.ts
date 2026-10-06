import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { AiConfidence, EscalationPriority } from '../../common/enums/escalation.enum';

function fakeMessageRepo() {
  const rows: any[] = [];
  let idCounter = 1;
  return {
    rows,
    create: jest.fn((data: any) => ({ id: `msg-${idCounter++}`, createdAt: new Date(), ...data })),
    save: jest.fn(async (entity: any) => {
      const idx = rows.findIndex((r) => r.id === entity.id);
      if (idx >= 0) rows[idx] = entity;
      else rows.push(entity);
      return entity;
    }),
    findOne: jest.fn(async ({ where }: any) => {
      let candidates = rows.filter((r) =>
        Object.entries(where).every(([k, v]) => r[k] === v),
      );
      return candidates[candidates.length - 1] || null;
    }),
    find: jest.fn(async ({ where }: any = {}) =>
      rows.filter((r) => Object.entries(where || {}).every(([k, v]) => r[k] === v)),
    ),
  };
}

function mockConfig() {
  const values: Record<string, any> = { 'rag.topK': 5, 'rag.similarityThreshold': 0.72, 'openai.mockMode': true };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('ChatService', () => {
  it('auto-creates an escalation when the AI determines needs_human=true (insufficient context)', async () => {
    const sessionRepo = {
      findOne: jest.fn(async () => ({ id: 'session-1', patientId: 'patient-1' })),
      save: jest.fn(async (s: any) => s),
    };
    const messageRepo = fakeMessageRepo();
    const knowledge = { retrieveRelevantChunks: jest.fn(async () => []) }; // nothing relevant found
    const ai = {
      embed: jest.fn(async () => [0.1]),
      answerQuestion: jest.fn(async () => ({
        answer: 'cannot answer',
        confidence: AiConfidence.INSUFFICIENT_CONTEXT,
        needsHuman: true,
        priority: EscalationPriority.NORMAL,
        reason: 'no_relevant_knowledge_chunks_retrieved',
        sourceChunkIds: [],
      })),
    };
    const redFlags = { matchPriority: jest.fn(async () => null) };
    const escalations = { create: jest.fn(async (_input: any) => ({})) };
    const patients = { findOne: jest.fn(async () => ({ id: 'patient-1', surgeryType: 'Knee Replacement' })) };
    const audit = { record: jest.fn() };

    const service = new ChatService(
      sessionRepo as any,
      messageRepo as any,
      knowledge as any,
      ai as any,
      redFlags as any,
      escalations as any,
      patients as any,
      audit as any,
      mockConfig(),
    );

    await service.sendMessage('patient-1', 'session-1', 'Can I double my painkiller dose?');

    expect(escalations.create).toHaveBeenCalled();
    const call = escalations.create.mock.calls[0][0];
    expect(call.patientId).toBe('patient-1');
  });

  it('escalates when the patient marks a confidently-answered message as not helpful', async () => {
    const sessionRepo = { findOne: jest.fn(async () => ({ id: 'session-1' })) };
    const messageRepo = fakeMessageRepo();
    messageRepo.rows.push({
      id: 'msg-1',
      sessionId: 'session-1',
      role: 'assistant',
      message: 'Here is the answer',
      needsHuman: false,
      priority: EscalationPriority.NORMAL,
      createdAt: new Date(),
    });
    messageRepo.rows.push({
      id: 'msg-0',
      sessionId: 'session-1',
      role: 'patient',
      message: 'Can I walk?',
      createdAt: new Date(),
    });

    const escalations = { create: jest.fn(async (_input: any) => ({})) };
    const service = new ChatService(
      sessionRepo as any,
      messageRepo as any,
      {} as any,
      {} as any,
      {} as any,
      escalations as any,
      {} as any,
      { record: jest.fn() } as any,
      mockConfig(),
    );

    await service.submitFeedback('patient-1', 'msg-1', false);

    expect(escalations.create).toHaveBeenCalled();
    const call = escalations.create.mock.calls[0][0];
    expect(call.reason).toMatch(/not helpful/i);
  });

  it('does not create a second escalation when the AI already triggered one (needsHuman already true)', async () => {
    const sessionRepo = { findOne: jest.fn(async () => ({ id: 'session-1' })) };
    const messageRepo = fakeMessageRepo();
    messageRepo.rows.push({
      id: 'msg-1',
      sessionId: 'session-1',
      role: 'assistant',
      message: 'cannot answer',
      needsHuman: true,
      createdAt: new Date(),
    });

    const escalations = { create: jest.fn(async () => ({})) };
    const service = new ChatService(
      sessionRepo as any,
      messageRepo as any,
      {} as any,
      {} as any,
      {} as any,
      escalations as any,
      {} as any,
      { record: jest.fn() } as any,
      mockConfig(),
    );

    await service.submitFeedback('patient-1', 'msg-1', false);
    expect(escalations.create).not.toHaveBeenCalled();
  });
});

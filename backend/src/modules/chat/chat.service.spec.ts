import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { AiConfidence, EscalationPriority } from '../../common/enums/escalation.enum';
import { ENGLISH_GREETING, HINDI_GREETING } from './greeting';
import { SAFE_ESCALATION_MESSAGE } from '../ai/system-prompt';

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

describe('ChatService greetings', () => {
  function buildService(aiAnswer: any) {
    const sessionRepo = {
      findOne: jest.fn(async () => ({ id: 'session-1', patientId: 'patient-1' })),
      save: jest.fn(async (s: any) => s),
    };
    const messageRepo = fakeMessageRepo();
    const knowledge = { retrieveRelevantChunks: jest.fn(async () => []) };
    const ai = { embed: jest.fn(async () => [0.1]), answerQuestion: jest.fn(async () => aiAnswer) };
    const redFlags = { matchPriority: jest.fn(async () => null) };
    const escalations = { create: jest.fn(async (_input: any) => ({})) };
    const patients = { findOne: jest.fn(async () => ({ id: 'patient-1' })) };
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
    return { service, messageRepo, knowledge, ai, redFlags, escalations };
  }

  it.each([
    ['Hi', ENGLISH_GREETING],
    ['  HELLO  ', ENGLISH_GREETING],
    ['hey', ENGLISH_GREETING],
    ['Namaste', HINDI_GREETING],
  ])('replies to "%s" without retrieval, the model, or an escalation', async (text, expected) => {
    const { service, knowledge, ai, redFlags, escalations } = buildService(undefined);

    const { patientMessage, assistantMessage } = await service.sendMessage('patient-1', 'session-1', text);

    expect(patientMessage.message).toBe(text);
    expect(assistantMessage.role).toBe('assistant');
    expect(assistantMessage.message).toBe(expected);
    expect(assistantMessage.confidence).toBe(AiConfidence.SUPPORTED);
    expect(assistantMessage.needsHuman).toBe(false);
    expect(ai.embed).not.toHaveBeenCalled();
    expect(ai.answerQuestion).not.toHaveBeenCalled();
    expect(knowledge.retrieveRelevantChunks).not.toHaveBeenCalled();
    expect(redFlags.matchPriority).not.toHaveBeenCalled();
    expect(escalations.create).not.toHaveBeenCalled();
  });

  it('sends a greeting with a medical question through the normal pipeline, escalation included', async () => {
    const { service, knowledge, ai, redFlags, escalations } = buildService({
      answer: 'cannot answer',
      confidence: AiConfidence.INSUFFICIENT_CONTEXT,
      needsHuman: true,
      priority: EscalationPriority.NORMAL,
      reason: 'no_relevant_knowledge_chunks_retrieved',
      sourceChunkIds: [],
    });

    const text = 'Hi, can I double my painkiller dose?';
    const { assistantMessage } = await service.sendMessage('patient-1', 'session-1', text);

    expect(ai.embed).toHaveBeenCalledWith(text);
    expect(knowledge.retrieveRelevantChunks).toHaveBeenCalled();
    expect(redFlags.matchPriority).toHaveBeenCalledWith(text);
    expect(ai.answerQuestion).toHaveBeenCalledWith(expect.objectContaining({ question: text }));
    expect(assistantMessage.message).toBe(SAFE_ESCALATION_MESSAGE);
    expect(escalations.create).toHaveBeenCalledWith(expect.objectContaining({ question: text }));
  });

  it('answers a supported greeting-plus-question from the model, not with the canned greeting', async () => {
    const { service, ai } = buildService({
      answer: 'Per the clinic leaflet, walk with support from day 1.',
      confidence: AiConfidence.SUPPORTED,
      needsHuman: false,
      priority: EscalationPriority.NORMAL,
      reason: 'answered',
      sourceChunkIds: [],
    });

    const { assistantMessage } = await service.sendMessage('patient-1', 'session-1', 'Namaste, can I walk after surgery?');

    expect(ai.answerQuestion).toHaveBeenCalled();
    expect(assistantMessage.message).toBe('Per the clinic leaflet, walk with support from day 1.');
  });
});

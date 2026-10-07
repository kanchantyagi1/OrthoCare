import { ConfigService } from '@nestjs/config';
import { AiProviderService } from './ai-provider.service';
import { AiConfidence } from '../../common/enums/escalation.enum';

function mockConfig(overrides: Record<string, any> = {}): ConfigService {
  const values: Record<string, any> = {
    'openai.mockMode': true,
    'openai.embeddingModel': 'text-embedding-3-small',
    'openai.model': 'gpt-4.1-mini',
    'openai.apiKey': undefined,
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('AiProviderService (mock mode - medical safety)', () => {
  it('never invents an answer when no relevant knowledge chunks are retrieved', async () => {
    const ai = new AiProviderService(mockConfig());
    const result = await ai.answerQuestion({
      question: 'Can I take double the prescribed painkiller dose?',
      retrievedChunks: [],
      conversationHistory: [],
    });

    expect(result.confidence).toBe(AiConfidence.INSUFFICIENT_CONTEXT);
    expect(result.needsHuman).toBe(true);
    expect(result.answer).toMatch(/connect your concern with the clinic team/i);
  });

  it('drops model-supplied citations that are not ids of the chunks it was given', () => {
    const ai = new AiProviderService(mockConfig());
    const real = '11111111-2222-3333-4444-555555555555';
    const chunks = [{ id: real, documentId: 'd', fileName: 'f.pdf', chunkText: 't' }] as any[];

    // A real model has returned positional indices instead of ids, and could cite an
    // id it was never shown. Either reaching the DB breaks the case list (uuid cast
    // error) or leaks a document this answer never saw.
    const filtered = (ai as any).validCitedChunkIds(
      ['1', '2', real, '99999999-8888-7777-6666-555555555555', null, 42],
      chunks,
    );

    expect(filtered).toEqual([real]);
  });

  it('answers only from supplied approved chunks when context is available (supported)', async () => {
    const ai = new AiProviderService(mockConfig());
    const result = await ai.answerQuestion({
      question: 'Can I walk after knee replacement?',
      retrievedChunks: [
        {
          id: 'chunk-1',
          chunkText: 'Follow your surgeon instructions about weight bearing.',
          fileName: 'knee-guide.pdf',
          similarity: 0.9,
        },
      ],
      conversationHistory: [],
    });

    expect(result.confidence).toBe(AiConfidence.SUPPORTED);
    expect(result.needsHuman).toBe(false);
    expect(result.answer).toContain('weight bearing');
    expect(result.sourceChunkIds).toEqual(['chunk-1']);
  });

  it('produces a deterministic mock embedding without any network call', async () => {
    const ai = new AiProviderService(mockConfig());
    const vector = await ai.embed('test question');
    expect(vector).toHaveLength(1536);
  });
});

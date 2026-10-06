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

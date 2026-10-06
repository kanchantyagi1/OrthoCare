import { KnowledgeService } from './knowledge.service';

describe('KnowledgeService.retrieveRelevantChunks', () => {
  it('drops chunks below the configured similarity threshold instead of forcing an answer', async () => {
    const dataSource = {
      query: jest.fn(async () => [
        { id: 'c1', chunk_text: 'Relevant text', file_name: 'a.pdf', section_title: null, page_number: 1, similarity: '0.9' },
        { id: 'c2', chunk_text: 'Barely related', file_name: 'a.pdf', section_title: null, page_number: 2, similarity: '0.5' },
      ]),
    };
    const chunkRepo = {};
    const ai = {};

    const service = new KnowledgeService(dataSource as any, chunkRepo as any, ai as any);
    const results = await service.retrieveRelevantChunks({
      queryEmbedding: [0.1, 0.2],
      topK: 5,
      similarityThreshold: 0.72,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('c1');
  });

  it('returns no chunks (triggering escalation upstream) when nothing clears the threshold', async () => {
    const dataSource = {
      query: jest.fn(async () => [
        { id: 'c1', chunk_text: 'Unrelated', file_name: 'a.pdf', section_title: null, page_number: 1, similarity: '0.3' },
      ]),
    };
    const service = new KnowledgeService(dataSource as any, {} as any, {} as any);
    const results = await service.retrieveRelevantChunks({
      queryEmbedding: [0.1],
      topK: 5,
      similarityThreshold: 0.72,
    });
    expect(results).toHaveLength(0);
  });

  it('only ever queries status = ACTIVE chunks', async () => {
    const dataSource = { query: jest.fn(async (_sql: string, _params: any[]) => []) };
    const service = new KnowledgeService(dataSource as any, {} as any, {} as any);
    await service.retrieveRelevantChunks({ queryEmbedding: [0.1], topK: 5, similarityThreshold: 0.72 });

    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toMatch(/status = 'ACTIVE'/);
  });
});

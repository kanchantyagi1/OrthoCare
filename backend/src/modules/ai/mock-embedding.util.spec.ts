import { mockEmbed } from './mock-embedding.util';

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both vectors are already normalized by mockEmbed
}

describe('mockEmbed', () => {
  it('is deterministic for the same text', () => {
    const a = mockEmbed('Can I walk after knee surgery?');
    const b = mockEmbed('Can I walk after knee surgery?');
    expect(a).toEqual(b);
  });

  it('returns a vector of the configured dimension', () => {
    expect(mockEmbed('hello', 1536)).toHaveLength(1536);
  });

  it('gives higher similarity to overlapping text than unrelated text', () => {
    const query = mockEmbed('Can I walk after knee replacement surgery');
    const related = mockEmbed('Walking after knee replacement surgery guidance');
    const unrelated = mockEmbed('Clinic billing invoice payment schedule');

    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });
});

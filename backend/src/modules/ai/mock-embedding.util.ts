/**
 * Deterministic, dependency-free "embedding" used only when OPENAI_API_KEY is not configured
 * (mock/dev mode). It's a crude normalized bag-of-words hash vector: NOT semantically meaningful
 * like a real embedding model, but deterministic and good enough to exercise the full RAG
 * pipeline (retrieval, thresholding, ACTIVE/ARCHIVED filtering) in tests and local dev without
 * any network calls or API costs.
 */
export function mockEmbed(text: string, dim = 1536): number[] {
  const vec = new Array(dim).fill(0);
  const words = (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const word of words) {
    const idx = hashString(word) % dim;
    vec[idx] += 1;
  }

  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

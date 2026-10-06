import { chunkDocxBlocks, chunkPdfPages } from './chunker';
import { DocxBlock } from '../extraction/docx-extractor';

describe('chunkPdfPages', () => {
  it('preserves page numbers per chunk', () => {
    const chunks = chunkPdfPages(['Page one text about walking.', 'Page two text about exercise.']);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].pageNumber).toBe(1);
    expect(chunks.some((c) => c.pageNumber === 2)).toBe(true);
  });

  it('skips blank pages', () => {
    const chunks = chunkPdfPages(['', '   ', 'Real content here.']);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageNumber).toBe(3);
  });

  it('never splits a sentence in half for long pages', () => {
    const longSentence = 'This is a single long sentence that keeps going and going without any period in between words '.repeat(
      6,
    ) + '.';
    const chunks = chunkPdfPages([longSentence]);
    // A single unsplittable sentence should remain as one chunk, even over the soft max length.
    expect(chunks).toHaveLength(1);
  });
});

describe('chunkDocxBlocks', () => {
  it('attaches the most recent heading as sectionTitle (section-aware chunking)', () => {
    const blocks: DocxBlock[] = [
      { type: 'heading', text: 'Walking Guidance' },
      { type: 'paragraph', text: 'Follow the surgeon instructions about weight bearing.' },
      { type: 'heading', text: 'Exercise Guidance' },
      { type: 'paragraph', text: 'Follow the physical therapist exercise plan.' },
    ];
    const chunks = chunkDocxBlocks(blocks);
    expect(chunks.find((c) => c.chunkText.includes('weight bearing'))?.sectionTitle).toBe('Walking Guidance');
    expect(chunks.find((c) => c.chunkText.includes('exercise plan'))?.sectionTitle).toBe('Exercise Guidance');
  });

  it('does not blindly split on arbitrary character length (groups paragraphs under max)', () => {
    const blocks: DocxBlock[] = [
      { type: 'heading', text: 'Notes' },
      { type: 'paragraph', text: 'Short para one.' },
      { type: 'paragraph', text: 'Short para two.' },
    ];
    const chunks = chunkDocxBlocks(blocks);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkText).toContain('Short para one.');
    expect(chunks[0].chunkText).toContain('Short para two.');
  });
});

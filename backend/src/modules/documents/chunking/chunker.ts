import { DocxBlock } from '../extraction/docx-extractor';

export interface ChunkInput {
  pageNumber?: number;
  sectionTitle?: string;
  chunkText: string;
}

const MAX_CHUNK_CHARS = 900;
const MIN_CHUNK_CHARS = 40;

/** Splits long text into chunks on sentence boundaries - never mid-sentence. */
function splitBySentence(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.length ? chunks : [text.trim()];
}

/**
 * PDF chunking: text is extracted per page without reliable heading markup (pdf-parse
 * does not preserve document structure), so chunks preserve the page number but not a
 * section title. Each page's text is split at sentence boundaries into ~900-char chunks.
 */
export function chunkPdfPages(pages: string[]): ChunkInput[] {
  const chunks: ChunkInput[] = [];

  pages.forEach((pageText, pageIdx) => {
    const trimmed = pageText.trim();
    if (!trimmed) return;

    for (const piece of splitBySentence(trimmed)) {
      if (piece.length < MIN_CHUNK_CHARS && chunks.length) {
        // Merge tiny trailing fragments into the previous chunk from the same page.
        const prev = chunks[chunks.length - 1];
        if (prev.pageNumber === pageIdx + 1) {
          prev.chunkText = `${prev.chunkText} ${piece}`;
          continue;
        }
      }
      chunks.push({ pageNumber: pageIdx + 1, chunkText: piece });
    }
  });

  return chunks;
}

/**
 * DOCX chunking: headings from the document become the sectionTitle for subsequent
 * paragraphs until the next heading - true section-aware chunking (section 16).
 * Paragraphs accumulate up to ~900 chars before flushing as a chunk; a single paragraph
 * longer than that is split at sentence boundaries, never splitting mid-sentence.
 */
export function chunkDocxBlocks(blocks: DocxBlock[]): ChunkInput[] {
  const chunks: ChunkInput[] = [];
  let currentSection: string | undefined;
  let buffer = '';

  const flush = () => {
    if (!buffer.trim()) return;
    for (const piece of splitBySentence(buffer, MAX_CHUNK_CHARS)) {
      chunks.push({ sectionTitle: currentSection, chunkText: piece });
    }
    buffer = '';
  };

  for (const block of blocks) {
    if (block.type === 'heading') {
      flush();
      currentSection = block.text;
      continue;
    }

    const candidate = buffer ? `${buffer}\n${block.text}` : block.text;
    if (candidate.length > MAX_CHUNK_CHARS && buffer) {
      flush();
      buffer = block.text;
    } else {
      buffer = candidate;
    }
  }
  flush();

  return chunks;
}

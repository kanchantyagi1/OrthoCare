import * as mammoth from 'mammoth';
import * as cheerio from 'cheerio';

export interface DocxBlock {
  type: 'heading' | 'paragraph' | 'table-row';
  text: string;
}

export interface DocxExtractionResult {
  blocks: DocxBlock[];
  fullText: string;
  ocrRequired: boolean;
}

/**
 * Extracts headings/paragraphs/tables from a DOCX buffer, preserving structure so the
 * chunker can do section-aware chunking instead of blind character splitting (section 16).
 */
export async function extractDocx(buffer: Buffer): Promise<DocxExtractionResult> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const $ = cheerio.load(html);
  const blocks: DocxBlock[] = [];

  $('body')
    .children()
    .each((_, el) => {
      const tag = (el as any).tagName?.toLowerCase();
      const text = $(el).text().trim();
      if (!text) return;

      if (tag && /^h[1-6]$/.test(tag)) {
        blocks.push({ type: 'heading', text });
      } else if (tag === 'table') {
        $(el)
          .find('tr')
          .each((__, row) => {
            const rowText = $(row).text().replace(/\s+/g, ' ').trim();
            if (rowText) blocks.push({ type: 'table-row', text: rowText });
          });
      } else {
        blocks.push({ type: 'paragraph', text });
      }
    });

  const fullText = blocks.map((b) => b.text).join('\n');

  return {
    blocks,
    fullText,
    ocrRequired: fullText.trim().length < 30,
  };
}

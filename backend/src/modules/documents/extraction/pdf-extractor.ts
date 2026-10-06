import * as path from 'path';

export interface PdfExtractionResult {
  pages: string[];
  fullText: string;
  numPages: number;
  ocrRequired: boolean;
}

const STANDARD_FONT_DATA_URL = path.join(
  path.dirname(require.resolve('pdfjs-dist/package.json')),
  'standard_fonts',
) + path.sep;

// pdfjs-dist is ESM-only (.mjs). TypeScript compiling to CommonJS would normally downlevel
// `import()` into `require()`, which cannot load an ESM module (ERR_REQUIRE_ESM). Building
// the import call via `new Function(...)` hides it from tsc's static transform so Node's
// real dynamic import() runs at runtime instead.
const dynamicImport: (specifier: string) => Promise<any> = new Function(
  'specifier',
  'return import(specifier);',
) as any;

/**
 * Extracts text per page from a PDF buffer using pdfjs-dist directly (NOT the `pdf-parse`
 * package - that one wraps a long-unmaintained, ancient bundled copy of pdf.js behind a
 * module-level singleton that silently corrupts itself across repeated calls in a
 * long-running process, intermittently throwing "Illegal character" / "bad XRef entry" on
 * perfectly valid PDFs the 2nd+ time it runs. pdfjs-dist is ESM-only, so it's loaded via
 * dynamic import() from this CommonJS module - that's deliberate, not an oversight.
 *
 * If the average extracted text per page is suspiciously low, the PDF is almost certainly
 * a scanned/image-only document, so we flag OCR_REQUIRED instead of silently creating
 * near-empty embeddings (per section 13).
 */
export async function extractPdf(buffer: Buffer): Promise<PdfExtractionResult> {
  const pdfjsLib: any = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs');

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;

  const pages: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item: any) => item.str).join(' '));
    }
  } finally {
    await doc.destroy();
  }

  const fullText = pages.join('\n\n');
  const numPages = pages.length || 1;
  const avgCharsPerPage = fullText.trim().length / numPages;

  return {
    pages,
    fullText,
    numPages,
    ocrRequired: avgCharsPerPage < 30,
  };
}

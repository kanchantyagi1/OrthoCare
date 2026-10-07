import { ClinicDocument } from './entities/document.entity';
import { DocumentVersion } from './entities/document-version.entity';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface DocumentListItem {
  id: string;
  fileName: string;
  fileType: string;
  version: string;
  status: string;
  uploadedByName: string;
  uploadedAt: string;
  chunkCount: number;
  failureReason: string | null;
}

function fileTypeFromMime(mimeType?: string): string {
  if (mimeType === PDF_MIME) return 'PDF';
  if (mimeType === DOCX_MIME) return 'DOCX';
  return mimeType ? 'OTHER' : 'TEXT';
}

/**
 * The app's Knowledge Base table needs one flat row per document (spec section 38),
 * but that data is split across the document, its current version and the uploader.
 * Returning the raw entity left `uploadedAt` undefined, which crashed the client.
 */
export function toDocumentListItem(
  document: ClinicDocument,
  version?: DocumentVersion | null,
  uploadedByName?: string | null,
): DocumentListItem {
  return {
    id: document.id,
    fileName: version?.fileName || document.title,
    fileType: fileTypeFromMime(version?.mimeType),
    version: version?.versionLabel || 'v1',
    status: document.status,
    uploadedByName: uploadedByName || 'Unknown',
    uploadedAt: document.createdAt.toISOString(),
    chunkCount: version?.chunkCount ?? 0,
    failureReason: version?.failureReason ?? null,
  };
}

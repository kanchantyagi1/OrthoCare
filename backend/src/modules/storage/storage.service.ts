import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface StoredFile {
  storageKey: string;
  storageBackend: 'local';
}

/**
 * Document storage is local disk only (backend/storage/documents/). No S3/AWS dependency -
 * this is a deliberate scope decision, not a dev-mode fallback.
 */
@Injectable()
export class StorageService {
  private readonly localRoot = path.join(__dirname, '..', '..', '..', 'storage', 'documents');

  constructor() {
    if (!fs.existsSync(this.localRoot)) {
      fs.mkdirSync(this.localRoot, { recursive: true });
    }
  }

  async save(key: string, buffer: Buffer, _contentType: string): Promise<StoredFile> {
    const filePath = path.join(this.localRoot, key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
    return { storageKey: key, storageBackend: 'local' };
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFileSync(path.join(this.localRoot, storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = path.join(this.localRoot, storageKey);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../app.module';
import { UsersService } from '../modules/users/users.service';
import { KnowledgeService } from '../modules/knowledge/knowledge.service';
import { ClinicDocument } from '../modules/documents/entities/document.entity';
import { DocumentVersion } from '../modules/documents/entities/document-version.entity';
import { DocumentStatus } from '../common/enums/document-status.enum';
import { Role } from '../common/enums/role.enum';

/**
 * Seeds the demo orthopedic knowledge pack ONLY.
 *
 * Staff accounts are not created here - they come from `npm run reset:clinic`, which
 * owns who can log in. Keeping the two separate means re-seeding knowledge can never
 * silently resurrect a demo login on a real clinic deployment.
 *
 * Seeded documents land in DEMO_REVIEW_REQUIRED: a doctor or admin must explicitly
 * activate each one before the assistant is allowed to answer from it.
 */
interface DemoRecord {
  title: string;
  surgeryType: string;
  category: string;
  sectionTitle: string;
  knowledgeText: string;
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const users = app.get(UsersService);
  const knowledge = app.get(KnowledgeService);
  const documentRepo = app.get<Repository<ClinicDocument>>(getRepositoryToken(ClinicDocument));
  const versionRepo = app.get<Repository<DocumentVersion>>(getRepositoryToken(DocumentVersion));

  // Attribute seeded documents to an existing admin if there is one. Nullable by
  // design, so seeding works on a clinic whose accounts have not been created yet.
  const admins = await users.findByRole(Role.ADMIN);
  const uploadedByUserId = admins[0]?.id;
  if (!uploadedByUserId) {
    console.log('No admin account exists yet - documents will show an unknown uploader.');
    console.log('Run `npm run reset:clinic` first if you want them attributed.');
  }

  console.log('--- Seeding demo knowledge pack (DEMO_REVIEW_REQUIRED, not ACTIVE) ---');

  // Prefer the repo-root copy (single source of truth for local/non-Docker runs);
  // fall back to the copy bundled inside backend/src/seed/ (Docker images only ever
  // get backend/'s own build context, not the sibling top-level knowledge/ folder).
  const repoRootPackPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'knowledge',
    'demo',
    'demo-knowledge-pack.json',
  );
  const bundledPackPath = path.join(__dirname, 'demo-knowledge-pack.json');
  const packPath = fs.existsSync(repoRootPackPath) ? repoRootPackPath : bundledPackPath;
  const records: DemoRecord[] = JSON.parse(fs.readFileSync(packPath, 'utf-8'));

  for (const record of records) {
    let document = await documentRepo.findOne({ where: { title: record.title } });
    if (document) {
      console.log(`  skip (already seeded): ${record.title}`);
      continue;
    }

    document = await documentRepo.save(
      documentRepo.create({
        title: record.title,
        surgeryType: record.surgeryType,
        category: record.category,
        status: DocumentStatus.DEMO_REVIEW_REQUIRED,
        uploadedByUserId,
      }),
    );

    const version = await versionRepo.save(
      versionRepo.create({
        documentId: document.id,
        versionLabel: 'v1',
        fileName: `${record.title}.seed.json`,
        mimeType: 'application/json',
        storageKey: '(seed-data, no file on disk)',
        storageBackend: 'local',
        status: DocumentStatus.DEMO_REVIEW_REQUIRED,
        chunkCount: 1,
        processedAt: new Date(),
      }),
    );

    await knowledge.insertChunks({
      documentId: document.id,
      documentVersionId: version.id,
      documentVersion: version.versionLabel,
      fileName: version.fileName,
      surgeryType: record.surgeryType,
      category: record.category,
      status: DocumentStatus.DEMO_REVIEW_REQUIRED,
      chunks: [{ sectionTitle: record.sectionTitle, chunkText: record.knowledgeText }],
    });

    console.log(`  seeded: ${record.title}`);
  }

  console.log('--- Done. Demo knowledge is DEMO_REVIEW_REQUIRED - a doctor or admin must ---');
  console.log('--- review and activate each document before the assistant can use it.   ---');

  await app.close();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });

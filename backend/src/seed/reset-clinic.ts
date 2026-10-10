import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { UsersService } from '../modules/users/users.service';
import { AuthService } from '../modules/auth/auth.service';
import { Role } from '../common/enums/role.enum';

/**
 * Hands the clinic over clean: removes every operational record and staff account,
 * then creates the admin logins below.
 *
 * KEEPS the knowledge base (documents / document_versions / knowledge_chunks) and
 * leaves document statuses untouched - re-ingesting and re-embedding clinic PDFs is
 * slow and costs OpenAI credits, so it is never done implicitly.
 *
 *   npm run reset:clinic
 *
 * Safe to re-run: existing admins are left in place rather than duplicated.
 */

/** Add a new admin by appending one line here. */
const ADMIN_ACCOUNTS: { email: string; fullName: string }[] = [
  { email: 'drmohitkumar79@gmail.com', fullName: 'Dr. Mohit Kumar' },
  { email: 'nktyagi423@gmail.com', fullName: 'N. K. Tyagi' },
];

const TEMPORARY_PASSWORD = 'Password123!';

/**
 * Deleted in FK-safe order. Knowledge tables are deliberately absent - see the
 * assertion in run() that fails loudly if anyone adds one.
 */
const OPERATIONAL_TABLES = [
  'doctor_case_notes',
  'notifications',
  'escalations',
  'chat_messages',
  'chat_sessions',
  'attendance',
  'shifts',
  'patients',
  'audit_logs',
  'doctors',
  'users',
];

const PROTECTED_KNOWLEDGE_TABLES = ['documents', 'document_versions', 'knowledge_chunks'];

async function run() {
  // Guard against a careless edit above quietly destroying the clinic's knowledge.
  const clobbered = OPERATIONAL_TABLES.filter((t) => PROTECTED_KNOWLEDGE_TABLES.includes(t));
  if (clobbered.length) {
    throw new Error(
      `reset:clinic refuses to run: it would delete knowledge tables (${clobbered.join(', ')}). ` +
        'Clinic documents and their embeddings must be preserved.',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const dataSource = app.get(DataSource);
  const users = app.get(UsersService);

  console.log('--- Prime Ortho clinic reset ---');

  const knowledgeBefore = await countKnowledge(dataSource);
  console.log(
    `Knowledge base (preserved): ${knowledgeBefore.documents} documents, ` +
      `${knowledgeBefore.versions} versions, ${knowledgeBefore.chunks} chunks`,
  );

  console.log('Deleting operational records:');
  for (const table of OPERATIONAL_TABLES) {
    if (!(await tableExists(dataSource, table))) {
      console.log(`  ${table.padEnd(18)} (table absent, skipped)`);
      continue;
    }
    const before = await countRows(dataSource, table);
    await dataSource.query(`DELETE FROM "${table}"`);
    console.log(`  ${table.padEnd(18)} ${before} row(s) deleted`);
  }

  console.log('Creating admin accounts:');
  const created: string[] = [];
  for (const account of ADMIN_ACCOUNTS) {
    const existing = await users.findByEmail(account.email);
    if (existing) {
      console.log(`  ${account.email} (already exists, left untouched)`);
      continue;
    }
    await users.create({
      email: account.email,
      passwordHash: await AuthService.hashPassword(TEMPORARY_PASSWORD),
      fullName: account.fullName,
      role: Role.ADMIN,
      isActive: true,
    });
    created.push(account.email);
    console.log(`  ${account.email} created`);
  }

  // Documents whose uploader was just deleted now show "Unknown"; re-attribute them
  // to an admin so the Knowledge Base screen stays meaningful.
  const firstAdmin = await users.findByEmail(ADMIN_ACCOUNTS[0].email);
  if (firstAdmin && (await tableExists(dataSource, 'documents'))) {
    const result = await dataSource.query(
      `UPDATE "documents" SET "uploaded_by_user_id" = $1 WHERE "uploaded_by_user_id" IS NULL`,
      [firstAdmin.id],
    );
    const reattributed = Array.isArray(result) ? result[1] : undefined;
    if (reattributed) {
      console.log(`Re-attributed ${reattributed} orphaned document(s) to ${firstAdmin.email}`);
    }
  }

  const knowledgeAfter = await countKnowledge(dataSource);
  if (
    knowledgeAfter.documents !== knowledgeBefore.documents ||
    knowledgeAfter.chunks !== knowledgeBefore.chunks
  ) {
    throw new Error(
      'reset:clinic altered the knowledge base, which must never happen. ' +
        `documents ${knowledgeBefore.documents} -> ${knowledgeAfter.documents}, ` +
        `chunks ${knowledgeBefore.chunks} -> ${knowledgeAfter.chunks}`,
    );
  }

  console.log('--- Done ---');
  console.log(`Admins can sign in with the temporary password: ${TEMPORARY_PASSWORD}`);
  console.log('Change it immediately via POST /auth/change-password.');
  if (created.length === 0) {
    console.log('(No new accounts were created - all configured admins already existed.)');
  }

  await app.close();
}

async function tableExists(dataSource: DataSource, table: string): Promise<boolean> {
  const rows = await dataSource.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [table],
  );
  return rows.length > 0;
}

async function countRows(dataSource: DataSource, table: string): Promise<number> {
  const rows = await dataSource.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
  return rows[0]?.count ?? 0;
}

async function countKnowledge(dataSource: DataSource) {
  const counts = { documents: 0, versions: 0, chunks: 0 };
  if (await tableExists(dataSource, 'documents')) {
    counts.documents = await countRows(dataSource, 'documents');
  }
  if (await tableExists(dataSource, 'document_versions')) {
    counts.versions = await countRows(dataSource, 'document_versions');
  }
  if (await tableExists(dataSource, 'knowledge_chunks')) {
    counts.chunks = await countRows(dataSource, 'knowledge_chunks');
  }
  return counts;
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Clinic reset failed:', err);
    process.exit(1);
  });

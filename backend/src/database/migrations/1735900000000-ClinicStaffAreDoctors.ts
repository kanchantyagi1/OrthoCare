import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clinic staff are doctors; the separate "nurse" tier is gone.
 *
 * Previously there were two staff roles: `nurse` (the working one - shifts,
 * attendance, escalation assignment) and a vestigial `doctor` (a profile table
 * holding specialization/license_number, referenced by patients.doctor_id and
 * red_flag_rules.doctor_id). They are collapsed into one: the working table is
 * renamed to `doctors` and absorbs the two credential columns, and the old
 * profile table is dropped.
 *
 * Deliberately destructive about staff *accounts*: every pre-existing user is
 * removed because the clinic is being handed over with freshly created admin
 * logins (see `npm run reset:clinic`). Knowledge data - documents,
 * document_versions, knowledge_chunks - is NEVER touched by this migration.
 *
 * Every step is guarded so this runs cleanly both against the already-deployed
 * schema and a database built from InitSchema. Those earlier migrations keep
 * their original "nurse" names on purpose: they are history, and rewriting them
 * would mean a fresh database created `doctors` directly and then this migration
 * would try to rename a table that does not exist.
 */
export class ClinicStaffAreDoctors1735900000000 implements MigrationInterface {
  name = 'ClinicStaffAreDoctors1735900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = async (t: string) =>
      (
        await queryRunner.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
          [t],
        )
      ).length > 0;

    const hasColumn = async (t: string, c: string) =>
      (
        await queryRunner.query(
          `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
          [t, c],
        )
      ).length > 0;

    /**
     * Drops every foreign key on a column, whatever it happens to be called.
     * InitSchema declared these inline, so the names are Postgres-generated; guessing
     * `<table>_<column>_fkey` and using DROP ... IF EXISTS would silently no-op on a
     * differently-named constraint and leave the old FK in force.
     */
    const dropForeignKeysOn = async (table: string, column: string) => {
      const constraints: { conname: string }[] = await queryRunner.query(
        `SELECT con.conname
           FROM pg_constraint con
           JOIN pg_class rel ON rel.oid = con.conrelid
           JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
          WHERE nsp.nspname = 'public'
            AND rel.relname = $1
            AND con.contype = 'f'
            AND $2 = ANY (
              SELECT att.attname FROM pg_attribute att
               WHERE att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
            )`,
        [table, column],
      );
      for (const { conname } of constraints) {
        await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${conname}"`);
      }
    };

    // --- 1. Clear operational rows that reference staff, so dropping the old
    // doctor profile table and its FKs cannot fail on dependent data. Knowledge
    // tables are intentionally absent from this list.
    for (const table of [
      'doctor_case_notes',
      'nurse_case_notes',
      'notifications',
      'escalations',
      'chat_messages',
      'chat_sessions',
      'attendance',
      'shifts',
      'audit_logs',
    ]) {
      if (await hasTable(table)) {
        await queryRunner.query(`DELETE FROM "${table}"`);
      }
    }
    // Patients are operational data too, and their doctor_id FK is about to move.
    if (await hasTable('patients')) {
      await queryRunner.query(`DELETE FROM "patients"`);
    }

    // --- 2. Drop the vestigial doctor profile table, detaching anything pointing at it.
    if (await hasTable('doctors')) {
      if (await hasColumn('patients', 'doctor_id')) {
        await dropForeignKeysOn('patients', 'doctor_id');
      }
      if (await hasColumn('red_flag_rules', 'doctor_id')) {
        await dropForeignKeysOn('red_flag_rules', 'doctor_id');
      }
      await queryRunner.query(`DROP TABLE "doctors" CASCADE`);
    }

    // --- 3. Promote the working staff table to be "doctors".
    if (await hasTable('nurses')) {
      await queryRunner.query(`ALTER TABLE "nurses" RENAME TO "doctors"`);
    }
    if (await hasTable('nurse_case_notes')) {
      await queryRunner.query(`ALTER TABLE "nurse_case_notes" RENAME TO "doctor_case_notes"`);
    }

    // Absorb the credential columns the dropped profile table used to hold.
    if (!(await hasColumn('doctors', 'specialization'))) {
      await queryRunner.query(`ALTER TABLE "doctors" ADD COLUMN "specialization" varchar`);
    }
    if (!(await hasColumn('doctors', 'license_number'))) {
      await queryRunner.query(`ALTER TABLE "doctors" ADD COLUMN "license_number" varchar`);
    }

    // --- 4. Rename the foreign keys that pointed at the old staff table.
    const columnRenames: [string, string, string][] = [
      ['attendance', 'nurse_id', 'doctor_id'],
      ['shifts', 'nurse_id', 'doctor_id'],
      ['escalations', 'assigned_nurse_id', 'assigned_doctor_id'],
      ['doctor_case_notes', 'nurse_id', 'doctor_id'],
    ];
    for (const [table, from, to] of columnRenames) {
      if ((await hasTable(table)) && (await hasColumn(table, from))) {
        await queryRunner.query(`ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"`);
      }
    }

    // The partial unique index that enforces "at most one open punch per person".
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_attendance_open_punch"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_attendance_open_punch" ON "attendance" ("doctor_id") WHERE "punch_out" IS NULL`,
    );

    // Re-point the patient/red-flag references at the renamed table.
    if (await hasColumn('patients', 'doctor_id')) {
      await queryRunner.query(
        `ALTER TABLE "patients" ADD CONSTRAINT "patients_doctor_id_fkey"
         FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE SET NULL`,
      );
    }
    if (await hasColumn('red_flag_rules', 'doctor_id')) {
      await queryRunner.query(
        `ALTER TABLE "red_flag_rules" ADD CONSTRAINT "red_flag_rules_doctor_id_fkey"
         FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE SET NULL`,
      );
    }

    // --- 5. Escalation status enum: WAITING_FOR_NURSE -> WAITING_FOR_DOCTOR.
    // Postgres cannot drop an enum label, so the type is rebuilt. Rows were already
    // cleared above, so no value mapping is needed beyond the default.
    await queryRunner.query(
      `ALTER TABLE "escalations" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(`ALTER TYPE "escalation_status_enum" RENAME TO "escalation_status_enum_old"`);
    await queryRunner.query(
      `CREATE TYPE "escalation_status_enum" AS ENUM ('WAITING_FOR_DOCTOR','ASSIGNED','CONTACTED','RESOLVED','ESCALATED_TO_DOCTOR')`,
    );
    await queryRunner.query(
      `ALTER TABLE "escalations" ALTER COLUMN "status" TYPE "escalation_status_enum"
       USING (CASE WHEN "status"::text = 'WAITING_FOR_NURSE' THEN 'WAITING_FOR_DOCTOR'
                   ELSE "status"::text END)::"escalation_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "escalations" ALTER COLUMN "status" SET DEFAULT 'WAITING_FOR_DOCTOR'`,
    );
    await queryRunner.query(`DROP TYPE "escalation_status_enum_old"`);

    // --- 6. Audit event enum: NURSE_CONTACTED -> DOCTOR_CONTACTED.
    await queryRunner.query(`ALTER TYPE "audit_event_enum" RENAME TO "audit_event_enum_old"`);
    await queryRunner.query(
      `CREATE TYPE "audit_event_enum" AS ENUM ('LOGIN','LOGOUT','PASSWORD_CHANGED','PUNCH_IN','PUNCH_OUT','DOCUMENT_UPLOADED','DOCUMENT_ACTIVATED','DOCUMENT_ARCHIVED','EMBEDDING_CREATED','AI_RESPONSE','ESCALATION_CREATED','ESCALATION_ASSIGNED','DOCTOR_CONTACTED','CASE_RESOLVED','DOCTOR_ESCALATION','RETENTION_CLEANUP')`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "event" TYPE "audit_event_enum"
       USING (CASE WHEN "event"::text = 'NURSE_CONTACTED' THEN 'DOCTOR_CONTACTED'
                   ELSE "event"::text END)::"audit_event_enum"`,
    );
    await queryRunner.query(`DROP TYPE "audit_event_enum_old"`);

    // --- 7. A clinic document has to outlive the admin account that uploaded it.
    // documents.uploaded_by_user_id was NOT NULL with a plain FK, which made it
    // impossible to remove a staff account while keeping the knowledge base - and
    // keeping the knowledge base is exactly the requirement here. Relax it to
    // nullable + ON DELETE SET NULL (the API already renders a missing uploader as
    // "Unknown") before clearing the accounts.
    if (await hasColumn('documents', 'uploaded_by_user_id')) {
      await queryRunner.query(
        `ALTER TABLE "documents" ALTER COLUMN "uploaded_by_user_id" DROP NOT NULL`,
      );
      // Must remove the existing FK by its real name: leaving a second,
      // non-SET-NULL FK in place would still block the DELETE FROM users below.
      await dropForeignKeysOn('documents', 'uploaded_by_user_id');
      await queryRunner.query(
        `ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_fkey"
         FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL`,
      );
    }

    // Staff accounts are recreated by reset:clinic, so drop the old ones and
    // remove the now-meaningless 'nurse' role from the enum.
    await queryRunner.query(`DELETE FROM "users"`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE varchar`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
    await queryRunner.query(`CREATE TYPE "users_role_enum" AS ENUM ('admin','doctor','patient')`);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "users_role_enum" USING "role"::"users_role_enum"`,
    );
  }

  public async down(): Promise<void> {
    // Not reversible: this migration deletes staff accounts and all operational rows,
    // so rolling it back would silently present an empty clinic as a restored one.
    // Restore from a database backup instead (infrastructure/aws/backup-postgres.sh).
    throw new Error(
      'ClinicStaffAreDoctors is irreversible - restore from a backup instead of reverting.',
    );
  }
}

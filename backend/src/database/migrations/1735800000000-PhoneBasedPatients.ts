import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patients no longer have user accounts: they identify themselves with a phone
 * number only (no email, no password, no login). A nurse calls that number back
 * when a question is escalated.
 *
 * `patients.user_id` therefore becomes nullable, and the patient's own name and
 * phone move onto the patient row. Pre-existing account-based patient rows keep
 * working unchanged - the API falls back to the linked user for those.
 */
export class PhoneBasedPatients1735800000000 implements MigrationInterface {
  name = 'PhoneBasedPatients1735800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "patients" ALTER COLUMN "user_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "phone" varchar`);
    await queryRunner.query(`ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "full_name" varchar`);

    // Carry the existing account holders' details onto the patient row so the nurse
    // case screen has a callable number for legacy rows too.
    await queryRunner.query(`
      UPDATE "patients" p
      SET "full_name" = COALESCE(p."full_name", u."full_name"),
          "phone" = COALESCE(p."phone", u."phone")
      FROM "users" u
      WHERE u."id" = p."user_id"
    `);

    await queryRunner.query(`CREATE INDEX "idx_patients_phone" ON "patients" ("phone")`);

    // One patient row per phone number for account-less patients, so concurrent
    // "start chat" requests can never fork the same person into two records.
    // Scoped to user_id IS NULL so it cannot collide with legacy account rows
    // that happen to share a phone number.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_patients_phone_accountless"
      ON "patients" ("phone")
      WHERE "user_id" IS NULL AND "phone" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_patients_phone_accountless"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_patients_phone"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN IF EXISTS "full_name"`);
    await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN IF EXISTS "phone"`);
    // Only possible once every account-less patient row is gone; they are deleted
    // here rather than left behind to violate the restored NOT NULL constraint.
    await queryRunner.query(`DELETE FROM "patients" WHERE "user_id" IS NULL`);
    await queryRunner.query(`ALTER TABLE "patients" ALTER COLUMN "user_id" SET NOT NULL`);
  }
}

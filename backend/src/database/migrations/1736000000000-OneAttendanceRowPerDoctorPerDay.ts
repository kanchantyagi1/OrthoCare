import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One attendance row per doctor per *clinic* day.
 *
 * Previously every punch-in inserted a new row, so a doctor cycling
 * punch-out/punch-in several times in a day produced several rows for that
 * day. The application now reopens the day's existing row instead (see
 * AttendanceService.punchIn), so the daily record is: earliest punch-in,
 * latest punch-out. This migration brings the already-deployed data in line
 * with that and makes it impossible to regress:
 *
 * 1. Collapses any existing same-day duplicate rows per doctor into one,
 *    holding MIN(punch_in) and - critically - NULL if ANY of that day's rows
 *    is still open (the doctor is currently on duty), otherwise
 *    MAX(punch_out). Getting that OR-is-open check wrong would silently
 *    punch out a doctor who is still clocked in.
 * 2. Adds a unique index on (doctor_id, clinic-local date of punch_in) so a
 *    second row for the same doctor/day can never be inserted again.
 *
 * "Clinic day" is computed the same way application code does it
 * (src/common/util/clinic-time.ts), just expressed in SQL via
 * `AT TIME ZONE` against Postgres's own IANA tz data: midnight-to-midnight
 * in the configured clinic timezone, not the server's UTC day. The zone name
 * is hard-coded to the deployment's current CLINIC_TIMEZONE default
 * ('Asia/Kolkata') because a SQL index expression cannot read an environment
 * variable - if that setting is ever changed for this clinic, the index
 * below needs a follow-up migration to match, or the uniqueness constraint
 * will enforce the wrong day boundary.
 *
 * Coexists with the pre-existing partial unique index
 * `uq_attendance_open_punch` (doctor_id WHERE punch_out IS NULL, added in
 * InitSchema / renamed in ClinicStaffAreDoctors): that one limits a doctor to
 * at most one *open* row across all time, this one limits them to at most
 * one row *per day* regardless of open/closed state. Neither conflicts with
 * the other.
 */
export class OneAttendanceRowPerDoctorPerDay1736000000000 implements MigrationInterface {
  name = 'OneAttendanceRowPerDoctorPerDay1736000000000';

  private static readonly CLINIC_TZ = 'Asia/Kolkata';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tz = OneAttendanceRowPerDoctorPerDay1736000000000.CLINIC_TZ;

    const hasTable = async (t: string) =>
      (
        await queryRunner.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
          [t],
        )
      ).length > 0;

    if (!(await hasTable('attendance'))) return;

    // Snapshot the collapse groups into a temp table first, rather than recomputing
    // the same CTE in both the UPDATE and the DELETE below: keep_id selection only
    // depends on doctor_id/punch_in, which neither statement touches, so recomputing
    // would in fact be safe too - but a fixed snapshot removes any doubt on
    // production data this migration only gets to run once against.
    await queryRunner.query(`
      CREATE TEMP TABLE _attendance_day_groups AS
      SELECT
        doctor_id,
        (punch_in AT TIME ZONE '${tz}')::date AS clinic_day,
        MIN(punch_in) AS kept_punch_in,
        CASE WHEN bool_or(punch_out IS NULL) THEN NULL ELSE MAX(punch_out) END AS kept_punch_out,
        (ARRAY_AGG(id ORDER BY punch_in ASC))[1] AS keep_id
      FROM attendance
      GROUP BY doctor_id, (punch_in AT TIME ZONE '${tz}')::date
    `);

    // Fold the collapsed punch_out (NULL if any row in the day was still open) onto
    // the kept row. kept_punch_in is already that row's own punch_in by construction
    // (it was chosen as the MIN), so punch_in itself needs no update.
    await queryRunner.query(`
      UPDATE attendance a
      SET punch_out = g.kept_punch_out
      FROM _attendance_day_groups g
      WHERE a.id = g.keep_id
    `);

    const collapsed = await queryRunner.query(`
      DELETE FROM attendance a
      USING _attendance_day_groups g
      WHERE a.doctor_id = g.doctor_id
        AND (a.punch_in AT TIME ZONE '${tz}')::date = g.clinic_day
        AND a.id <> g.keep_id
      RETURNING a.id
    `);
    console.log(
      `[OneAttendanceRowPerDoctorPerDay] collapsed ${collapsed.length} duplicate same-day attendance row(s)`,
    );

    await queryRunner.query(`DROP TABLE _attendance_day_groups`);

    await queryRunner.query(`DROP INDEX IF EXISTS "uq_attendance_one_per_doctor_per_day"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_attendance_one_per_doctor_per_day"
        ON "attendance" ("doctor_id", ((punch_in AT TIME ZONE '${tz}')::date))
    `);
  }

  public async down(): Promise<void> {
    // Not reversible: collapsing discards which individual punch cycles made up a
    // day's row (the original per-cycle punch_in/punch_out pairs are gone, only
    // first-in/last-out survive), so there is no data to reconstruct separate rows
    // from. Restore from a database backup instead (infrastructure/aws/backup-postgres.sh).
    throw new Error(
      'OneAttendanceRowPerDoctorPerDay is irreversible - restore from a backup instead of reverting.',
    );
  }
}

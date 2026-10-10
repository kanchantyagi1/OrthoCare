/**
 * Clinic staff are doctors; there is no separate nurse tier. Patients never appear
 * here as a login - they are account-less and identified by phone number - but the
 * value is retained because patient rows that predate that change still carry it.
 */
export enum Role {
  ADMIN = 'admin',
  DOCTOR = 'doctor',
  PATIENT = 'patient',
}

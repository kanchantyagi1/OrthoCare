/**
 * Clinic-local time arithmetic.
 *
 * Shifts are stored as wall-clock `"HH:mm"` strings in the clinic's own day, but the
 * server process runs in whatever zone the host is set to - `Etc/UTC` on the deployed
 * EC2 box. Deriving the current hour from `new Date().getHours()` therefore compared a
 * clinic-local window against a UTC clock: a 07:00-12:00 IST shift was only treated as
 * active between 07:00-12:00 UTC (12:30-17:30 IST), so `getCurrentAvailableDoctor()`
 * found nobody on shift and every escalation fell through to WAITING_FOR_DOCTOR.
 *
 * Everything that needs "what time is it at the clinic" must go through this module so
 * the two cannot drift apart again. Conversion uses `Intl.DateTimeFormat` with an
 * explicit `timeZone`, so DST-observing clinics are handled by the runtime's tz data
 * rather than a hard-coded offset.
 */

export const DEFAULT_CLINIC_TIMEZONE = 'Asia/Kolkata';

interface ClinicParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * `hourCycle: 'h23'` matters: with `hour12: false` some engines render midnight as
 * hour "24", which would make minute-of-day arithmetic jump a whole day.
 */
function clinicParts(timeZone: string, now: Date): ClinicParts {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts: Record<string, string> = {};
  for (const { type, value } of formatter.formatToParts(now)) {
    parts[type] = value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Minutes elapsed since midnight *at the clinic* (0-1439). */
export function clinicMinutesOfDay(timeZone: string, now: Date = new Date()): number {
  const { hour, minute } = clinicParts(timeZone, now);
  return hour * 60 + minute;
}

/** Current clinic wall-clock time as a zero-padded `"HH:mm"`, comparable with shift strings. */
export function clinicHhMm(timeZone: string, now: Date = new Date()): string {
  const { hour, minute } = clinicParts(timeZone, now);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * The instant at which the clinic's current day began, for `created_at >= :since`
 * style queries. Derived by subtracting the clinic-local time-of-day from `now`
 * rather than by constructing a local Date, which would be interpreted in the
 * server's zone.
 *
 * A DST transition between clinic midnight and now shifts this by the offset
 * change; irrelevant for Asia/Kolkata (no DST) and at most an hour elsewhere.
 */
export function clinicStartOfDay(timeZone: string, now: Date = new Date()): Date {
  const { hour, minute, second } = clinicParts(timeZone, now);
  const elapsedMs =
    (hour * 3600 + minute * 60 + second) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsedMs);
}

/**
 * Whether `nowMinutes` falls inside an `"HH:mm"`-`"HH:mm"` window. A window whose end
 * is at or before its start wraps past midnight (e.g. 22:00-06:00).
 */
export function isWithinShiftWindow(
  nowMinutes: number,
  startTime: string,
  endTime: string,
): boolean {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  if (Number.isNaN(start) || Number.isNaN(end)) return false;

  if (start <= end) {
    return nowMinutes >= start && nowMinutes <= end;
  }
  return nowMinutes >= start || nowMinutes <= end;
}

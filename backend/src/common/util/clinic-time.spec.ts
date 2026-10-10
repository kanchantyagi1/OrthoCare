import {
  clinicHhMm,
  clinicMinutesOfDay,
  clinicStartOfDay,
  isWithinShiftWindow,
} from './clinic-time';

/**
 * These assert against fixed UTC instants, so they are independent of the machine's
 * own timezone. That matters: the bug they guard shipped because the production host
 * runs UTC while shifts are entered in clinic-local time, and a test written with a
 * local-time literal passes on an IST laptop regardless of which clock the code reads.
 */
describe('clinic-time', () => {
  // 03:30Z is 09:00 in IST (+05:30) and 23:30 the previous day in New York (-04:00 DST).
  const instant = new Date('2026-07-01T03:30:00Z');

  describe('clinicMinutesOfDay', () => {
    it('converts a UTC instant into minutes since midnight in the clinic zone', () => {
      expect(clinicMinutesOfDay('Asia/Kolkata', instant)).toBe(9 * 60); // 09:00
      expect(clinicMinutesOfDay('UTC', instant)).toBe(3 * 60 + 30); // 03:30
      expect(clinicMinutesOfDay('America/New_York', instant)).toBe(23 * 60 + 30); // 23:30
    });

    it('reports 0 at clinic midnight rather than 1440 (hourCycle h23, not "24")', () => {
      // 18:30Z is exactly 00:00 IST the next day.
      expect(clinicMinutesOfDay('Asia/Kolkata', new Date('2026-07-01T18:30:00Z'))).toBe(0);
    });

    it('follows DST in zones that observe it', () => {
      const winter = new Date('2026-01-15T12:00:00Z'); // New York is UTC-5
      const summer = new Date('2026-07-15T12:00:00Z'); // New York is UTC-4
      expect(clinicMinutesOfDay('America/New_York', winter)).toBe(7 * 60);
      expect(clinicMinutesOfDay('America/New_York', summer)).toBe(8 * 60);
    });
  });

  describe('clinicHhMm', () => {
    it('renders zero-padded clinic wall-clock time comparable with shift strings', () => {
      expect(clinicHhMm('Asia/Kolkata', instant)).toBe('09:00');
      expect(clinicHhMm('UTC', instant)).toBe('03:30');
      expect(clinicHhMm('Asia/Kolkata', new Date('2026-07-01T02:05:00Z'))).toBe('07:35');
    });
  });

  describe('clinicStartOfDay', () => {
    it('returns the instant of clinic midnight, not server midnight', () => {
      // Clinic midnight IST for 09:00 IST = 2026-06-30T18:30:00Z.
      expect(clinicStartOfDay('Asia/Kolkata', instant).toISOString()).toBe(
        '2026-06-30T18:30:00.000Z',
      );
      expect(clinicStartOfDay('UTC', instant).toISOString()).toBe('2026-07-01T00:00:00.000Z');
    });

    it('is always in the past relative to now and at most 24h back', () => {
      const start = clinicStartOfDay('Asia/Kolkata', instant);
      expect(start.getTime()).toBeLessThanOrEqual(instant.getTime());
      expect(instant.getTime() - start.getTime()).toBeLessThan(24 * 3600 * 1000);
    });
  });

  describe('isWithinShiftWindow', () => {
    it('handles a normal daytime window inclusively', () => {
      expect(isWithinShiftWindow(9 * 60, '07:00', '12:00')).toBe(true);
      expect(isWithinShiftWindow(7 * 60, '07:00', '12:00')).toBe(true);
      expect(isWithinShiftWindow(12 * 60, '07:00', '12:00')).toBe(true);
      expect(isWithinShiftWindow(6 * 60 + 59, '07:00', '12:00')).toBe(false);
      expect(isWithinShiftWindow(12 * 60 + 1, '07:00', '12:00')).toBe(false);
    });

    it('handles an overnight window that wraps midnight', () => {
      expect(isWithinShiftWindow(23 * 60, '22:00', '06:00')).toBe(true);
      expect(isWithinShiftWindow(2 * 60, '22:00', '06:00')).toBe(true);
      expect(isWithinShiftWindow(12 * 60, '22:00', '06:00')).toBe(false);
    });

    it('is false rather than throwing on a malformed window', () => {
      expect(isWithinShiftWindow(9 * 60, 'not-a-time', '12:00')).toBe(false);
    });
  });
});

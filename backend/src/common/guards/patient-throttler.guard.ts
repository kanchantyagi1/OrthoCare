import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limiter for the public, login-less patient endpoints.
 *
 * The default ThrottlerGuard buckets by IP, which is not enough here: a whole
 * clinic (or a mobile carrier's NAT) shares one address, while an abuser can
 * rotate addresses. So this keys on the patient's own identifier when the request
 * carries one -
 *   - `phone` when starting a session, and
 *   - `sessionId` for everything afterwards (one bucket per patient device)
 * - and only falls back to IP when neither is present.
 *
 * The IP is always mixed into the key so one bucket cannot be shared across
 * wildly different origins, and so a single IP flooding many distinct phone
 * numbers still gets throttled by the separate global IP limit.
 */
@Injectable()
export class PatientThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ip = req.ips?.length ? req.ips[0] : req.ip;
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.replace(/\D/g, '') : '';
    if (phone) return `patient-phone:${phone}`;

    const sessionId =
      (typeof req.body?.sessionId === 'string' && req.body.sessionId) ||
      (typeof req.query?.sessionId === 'string' && req.query.sessionId) ||
      '';
    if (sessionId) return `patient-session:${sessionId}`;

    return `patient-ip:${ip}`;
  }
}

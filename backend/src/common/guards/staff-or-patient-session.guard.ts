import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../enums/role.enum';

/**
 * Lets one route serve both audiences without branching auth inside the handler:
 *
 *  - a patient supplying `?sessionId=` passes the guard (they have no account and
 *    no JWT; the session id is their only credential), and
 *  - everyone else must present a valid staff JWT.
 *
 * Passing this guard is NOT authorisation to read anything in particular: the
 * service still resolves the session to exactly one patient and returns only that
 * patient's rows. The session id is a bearer capability, so possessing someone
 * else's id would expose their data - which is why it is a server-generated v4
 * UUID that is never derivable from a phone number.
 */
@Injectable()
export class StaffOrPatientSessionGuard extends AuthGuard('jwt') {
  private static readonly STAFF_ROLES: Role[] = [Role.NURSE, Role.ADMIN, Role.DOCTOR];

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const sessionId = request.query?.sessionId;
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      request.patientSessionId = sessionId;
      return true;
    }

    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;

    return StaffOrPatientSessionGuard.STAFF_ROLES.includes(request.user?.role);
  }
}

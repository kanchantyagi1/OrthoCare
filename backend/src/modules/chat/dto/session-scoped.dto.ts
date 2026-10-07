import { IsUUID } from 'class-validator';

/** Query params for the public patient endpoints: the session id is the credential. */
export class SessionScopedDto {
  @IsUUID()
  sessionId: string;
}

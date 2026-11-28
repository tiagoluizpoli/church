import type { AuthorityCaller } from '../../domain/contracts/application/authority-manager';
import type { RequestCallerInput } from './request-caller.types';

/** The one place a controller reads who asks: the caller Active Church resolution set. */
export function requestCaller({
  request: { churchId, userId, actor },
}: RequestCallerInput): AuthorityCaller {
  return { churchId, userId, actor };
}

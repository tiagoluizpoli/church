import { env } from '@church/env/server';

/**
 * Gate for any debug-only HTTP route (e.g. redemption's verification-code
 * readback for E2E). Production is always excluded regardless of the flag;
 * `ENABLE_DEBUG_ENDPOINTS` then opts a non-production environment in, so a
 * future public one (staging, ...) stays shut by default instead of
 * inheriting every debug route from `NODE_ENV` alone.
 */
export function debugEndpointsEnabled(): boolean {
  return env.NODE_ENV !== 'production' && env.ENABLE_DEBUG_ENDPOINTS;
}

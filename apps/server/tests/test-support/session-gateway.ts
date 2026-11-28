import type { SessionGateway } from '@/domain/contracts/infrastructure/session-gateway';
import { BetterAuthSessionGateway } from '@/infrastructure/services/better-auth-session-gateway';
import { auth } from '@/main/di/server-auth';

/**
 * The session lookup the composition root builds, over this test file's
 * server auth instance (usually its `vi.mock` of `@/main/di/server-auth`).
 */
export function testSessionGateway(): SessionGateway {
  return new BetterAuthSessionGateway({ auth });
}

import { formatDatabaseTargetPreflight } from '@church/db/database-target-resolver';
import { resolveE2eDatabaseTarget } from '@church/db/e2e-database-url';
import type { FastifyInstance } from 'fastify';

/** Carries the redacted database-target fingerprint on every E2E response. */
export const E2E_TARGET_HEADER = 'x-church-e2e-target';

export interface RegisterE2eTargetHeaderInput {
  app: FastifyInstance;
  /** `debugEndpointsEnabled()`: production never exposes its target. */
  enabled: boolean;
}

/**
 * E2E-only (ADR-0005, #253): stamps each response with the fingerprint of the
 * database this server resolved, so a journey can prove the process that
 * provisioned an invitation and the one that redeemed it share the run's
 * pinned target. Resolving at registration also refuses a non-E2E database
 * before the server listens.
 */
export function registerE2eTargetHeader(
  input: RegisterE2eTargetHeaderInput,
): void {
  if (!input.enabled || process.env.CHURCH_EXEC_PURPOSE !== 'e2e') return;

  const fingerprint = formatDatabaseTargetPreflight({
    identity: resolveE2eDatabaseTarget().identity,
  });

  input.app.addHook('onSend', async (_request, reply, payload) => {
    reply.header(E2E_TARGET_HEADER, fingerprint);
    return payload;
  });
}

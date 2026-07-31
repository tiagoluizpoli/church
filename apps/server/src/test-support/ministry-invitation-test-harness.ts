import { DbAuthorityManager } from '../application/db-authority-manager';
import { DbMinistryInvitationManager } from '../application/db-ministry-invitation-manager';
import { DrizzleAuthorityActorResolver } from '../infrastructure/auth/drizzle-authority-actor-resolver';
import { DrizzleSchedulingScopeResolver } from '../infrastructure/auth/drizzle-scheduling-scope-resolver';
import {
  DrizzleEventRepository,
  DrizzleMinistryInvitationRepository,
  DrizzleMinistryRepository,
  DrizzleOutboxRepository,
  DrizzleRoleRepository,
  DrizzleTimeSlotRepository,
  DrizzleUnitOfWork,
} from '../infrastructure/repositories';
import type { AnyDrizzleDb } from '../infrastructure/repositories/types';

export interface MinistryInvitationTestHarnessOptions {
  db: AnyDrizzleDb;
}

/**
 * Wires the real Drizzle repositories, authority manager and minting manager
 * used by every Ministry Invitation / outbox integration test — extracted so
 * new suites in this area (the outbox worker's tests, next) don't repeat it.
 */
export function createMinistryInvitationTestHarness({
  db,
}: MinistryInvitationTestHarnessOptions) {
  const ministryInvitationRepository = new DrizzleMinistryInvitationRepository(
    db,
  );
  const roleRepository = new DrizzleRoleRepository(db);
  const ministryRepository = new DrizzleMinistryRepository(db);
  const outboxRepository = new DrizzleOutboxRepository({ db });
  const authorityManager = new DbAuthorityManager(
    new DrizzleAuthorityActorResolver(db),
    new DrizzleSchedulingScopeResolver(db),
    new DrizzleEventRepository(db),
    new DrizzleTimeSlotRepository(db),
  );
  const unitOfWork = new DrizzleUnitOfWork(db);
  const manager = new DbMinistryInvitationManager(
    ministryInvitationRepository,
    roleRepository,
    ministryRepository,
    authorityManager,
    unitOfWork,
  );

  return {
    ministryInvitationRepository,
    roleRepository,
    ministryRepository,
    outboxRepository,
    authorityManager,
    unitOfWork,
    manager,
  };
}

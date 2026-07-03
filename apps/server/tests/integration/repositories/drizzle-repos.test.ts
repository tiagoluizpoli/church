/**
 * Integration test runner: executes all repository contract suites
 * against concrete Drizzle implementations backed by a real PostgreSQL DB.
 *
 * Seed layout (stable IDs used by contract specs):
 *   church-1, church-2
 *   user-1, user-2
 *   ministry-1 (Adult Ministry, church-1), ministry-2 (Youth Ministry, church-1)
 *   volunteer-1 (user-1, church-1), volunteer-2 (user-2, church-1)
 *   role-1 (Usher, ministry-1), role-2 (Greeter, ministry-1)
 *   event-1 (draft, June 5), event-2 (published, June 4)
 *   slot-1 (event-1 slot), slot-requirement-1
 *   assignment-1 (confirmed, volunteer-1+slot-1), assignment-2 (declined, volunteer-2+slot-1)
 *   availability-1 (volunteer-1)
 *   audit-1, audit-2 (for assignment-1)
 */
import {
  runAssignmentAuditRepositoryContractTests,
  runAssignmentRepositoryContractTests,
  runChurchRepositoryContractTests,
  runEventRepositoryContractTests,
  runMinistryRepositoryContractTests,
  runRoleRepositoryContractTests,
  runTimeSlotRepositoryContractTests,
  runVolunteerRepositoryContractTests,
} from '../../../src/domain/contracts/contract-tests';
import { DrizzleAssignmentRepository } from '../../../src/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '../../../src/infrastructure/repositories/drizzle-assignment-audit.repository';
import { DrizzleChurchRepository } from '../../../src/infrastructure/repositories/drizzle-church.repository';
import { DrizzleEventRepository } from '../../../src/infrastructure/repositories/drizzle-event.repository';
import { DrizzleMinistryRepository } from '../../../src/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleRoleRepository } from '../../../src/infrastructure/repositories/drizzle-role.repository';
import { DrizzleTimeSlotRepository } from '../../../src/infrastructure/repositories/drizzle-time-slot.repository';
import { DrizzleVolunteerRepository } from '../../../src/infrastructure/repositories/drizzle-volunteer.repository';
import { seed, testDb, truncateAll } from './setup';

runChurchRepositoryContractTests(
  async () => {
    await truncateAll();
    await seed();
    return new DrizzleChurchRepository(testDb);
  },
  async () => {
    await truncateAll();
  },
);

runMinistryRepositoryContractTests(
  async () => {
    await truncateAll();
    await seed();
    return new DrizzleMinistryRepository(testDb);
  },
  async () => {
    await truncateAll();
  },
);

runRoleRepositoryContractTests(
  async () => {
    await truncateAll();
    await seed();
    return new DrizzleRoleRepository(testDb);
  },
  async () => {
    await truncateAll();
  },
);

runVolunteerRepositoryContractTests(
  async () => {
    await truncateAll();
    await seed();
    return new DrizzleVolunteerRepository(testDb);
  },
  async () => {
    await truncateAll();
  },
);

runEventRepositoryContractTests(
  async () => {
    await truncateAll();
    await seed();
    return new DrizzleEventRepository(testDb);
  },
  async () => {
    await truncateAll();
  },
);

runTimeSlotRepositoryContractTests(
  async () => {
    await truncateAll();
    await seed();
    return new DrizzleTimeSlotRepository(testDb);
  },
  async () => {
    await truncateAll();
  },
);

runAssignmentRepositoryContractTests(
  async () => {
    await truncateAll();
    await seed();
    return new DrizzleAssignmentRepository(testDb);
  },
  async () => {
    await truncateAll();
  },
);

runAssignmentAuditRepositoryContractTests(
  async () => {
    await truncateAll();
    await seed();
    return new DrizzleAssignmentAuditRepository(testDb);
  },
  async () => {
    await truncateAll();
  },
);

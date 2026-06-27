/**
 * Repository registry.
 *
 * Instantiates all Drizzle repositories once with the shared db connection and
 * re-exports them typed by their domain interface. Routers MUST import
 * repositories from here — never from @church/db directly.
 */
import { db } from '@church/db';
import type { AssignmentRepository } from '../../domain/repositories/assignment.repository';
import type { AssignmentAuditRepository } from '../../domain/repositories/assignment-audit.repository';
import type { AvailabilityRepository } from '../../domain/repositories/availability.repository';
import type { EventRepository } from '../../domain/repositories/event.repository';
import type { RoleRepository } from '../../domain/repositories/role.repository';
import type { RoleTemplateRepository } from '../../domain/repositories/role-template.repository';
import type { TimeSlotRepository } from '../../domain/repositories/time-slot.repository';
import type { UnitOfWork } from '../../domain/repositories/unit-of-work';
import type { VolunteerRepository } from '../../domain/repositories/volunteer.repository';
import { DrizzleAssignmentRepository } from './drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from './drizzle-assignment-audit.repository';
import { DrizzleAvailabilityRepository } from './drizzle-availability.repository';
import { DrizzleEventRepository } from './drizzle-event.repository';
import { DrizzleRoleRepository } from './drizzle-role.repository';
import { DrizzleRoleTemplateRepository } from './drizzle-role-template.repository';
import { DrizzleTimeSlotRepository } from './drizzle-time-slot.repository';
import { DrizzleUnitOfWork } from './drizzle-unit-of-work';
import { DrizzleVolunteerRepository } from './drizzle-volunteer.repository';
import type { AnyDrizzleDb } from './types';

export interface Repositories {
  volunteers: VolunteerRepository;
  events: EventRepository;
  timeSlots: TimeSlotRepository;
  assignments: AssignmentRepository;
  assignmentAudits: AssignmentAuditRepository;
  availability: AvailabilityRepository;
  roles: RoleRepository;
  roleTemplates: RoleTemplateRepository;
  unitOfWork: UnitOfWork;
}

// The @church/db module exports db typed against its full module namespace
// (which includes createDb and db keys), while AnyDrizzleDb only references
// the schema subset. The runtime value is identical; we use a safe cast.
const typedDb = db as unknown as AnyDrizzleDb;

export const repositories: Repositories = {
  volunteers: new DrizzleVolunteerRepository(typedDb),
  events: new DrizzleEventRepository(typedDb),
  timeSlots: new DrizzleTimeSlotRepository(typedDb),
  assignments: new DrizzleAssignmentRepository(typedDb),
  assignmentAudits: new DrizzleAssignmentAuditRepository(typedDb),
  availability: new DrizzleAvailabilityRepository(typedDb),
  roles: new DrizzleRoleRepository(typedDb),
  roleTemplates: new DrizzleRoleTemplateRepository(typedDb),
  unitOfWork: new DrizzleUnitOfWork(typedDb),
};

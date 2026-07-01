// biome-ignore-all format: preserve single-line calls for ts-expect-error targeting
// biome-ignore-all lint/suspicious/noExplicitAny: needed for type tests
import { describe, it } from 'vitest';
import type { AssignmentRepository } from '../../../src/application/contracts/assignment.repository';
import type { AssignmentAuditRepository } from '../../../src/application/contracts/assignment-audit.repository';
import type { AvailabilityRepository } from '../../../src/application/contracts/availability.repository';
import type { EventRepository } from '../../../src/application/contracts/event.repository';
import type { MinistryRepository } from '../../../src/application/contracts/ministry.repository';
import type { RoleRepository } from '../../../src/application/contracts/role.repository';
import type { TimeSlotRepository } from '../../../src/application/contracts/time-slot.repository';
import type { VolunteerRepository } from '../../../src/application/contracts/volunteer.repository';
import type { AssignmentId } from '../../../src/domain/entities/assignment';
import type { AvailabilityId } from '../../../src/domain/entities/availability';
import type { EventId } from '../../../src/domain/entities/event';
import type { MinistryId } from '../../../src/domain/entities/ministry';
import type { RoleId } from '../../../src/domain/entities/role';
import type { TimeSlotId } from '../../../src/domain/entities/time-slot';
import type { VolunteerId } from '../../../src/domain/entities/volunteer';

describe('User Story 3: Church Isolation Type Safety', () => {
  it('should enforce ChurchId as the first parameter on all repository methods', () => {
    // This is a compilation-only type test.
    // If the type safety is breached, removing `@ts-expect-error` will compile without errors.
    // Wrap in a conditional block to avoid runtime calls on the dummy stub.
    if (Date.now() < 0) {
      // 1. MinistryRepository
      const ministryRepo = {} as MinistryRepository;
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      ministryRepo.getById('plain-string', 'ministry-1' as MinistryId);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      ministryRepo.listByChurch('plain-string');
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      ministryRepo.getSettings('plain-string', 'ministry-1' as MinistryId);

      // 2. RoleRepository
      const roleRepo = {} as RoleRepository;
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      roleRepo.getById('plain-string', 'role-1' as RoleId);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      roleRepo.listByMinistry('plain-string', 'ministry-1' as MinistryId);

      // 3. VolunteerRepository
      const volunteerRepo = {} as VolunteerRepository;
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      volunteerRepo.getById('plain-string', 'volunteer-1' as VolunteerId);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      volunteerRepo.hasRoleQualification('plain-string', 'volunteer-1' as VolunteerId, 'role-1' as RoleId);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      volunteerRepo.hasMembershipInMinistry('plain-string', 'volunteer-1' as VolunteerId, 'ministry-1' as MinistryId);

      // 4. AvailabilityRepository
      const availabilityRepo = {} as AvailabilityRepository;
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      availabilityRepo.listByVolunteerInRange('plain-string', 'volunteer-1' as VolunteerId, new Date(), new Date());
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      availabilityRepo.create('plain-string', {} as any);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      availabilityRepo.update('plain-string', 'availability-1' as AvailabilityId, {} as any);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      availabilityRepo.delete('plain-string', 'availability-1' as AvailabilityId);

      // 5. EventRepository
      const eventRepo = {} as EventRepository;
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      eventRepo.getById('plain-string', 'event-1' as EventId);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      eventRepo.listByMinistryInRange('plain-string', 'ministry-1' as MinistryId, new Date(), new Date());
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      eventRepo.create('plain-string', {} as any);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      eventRepo.updateStatus('plain-string', 'event-1' as EventId, { status: 'published' });

      // 6. TimeSlotRepository
      const timeSlotRepo = {} as TimeSlotRepository;
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      timeSlotRepo.getById('plain-string', 'slot-1' as TimeSlotId);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      timeSlotRepo.listByEvent('plain-string', 'event-1' as EventId);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      timeSlotRepo.bulkCreate('plain-string', {} as any);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      timeSlotRepo.deleteByEvent('plain-string', 'event-1' as EventId);

      // 7. AssignmentRepository
      const assignmentRepo = {} as AssignmentRepository;
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      assignmentRepo.getById('plain-string', 'assignment-1' as AssignmentId);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      assignmentRepo.create('plain-string', {} as any);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      assignmentRepo.updateStatus('plain-string', 'assignment-1' as AssignmentId, {} as any);

      // 8. AssignmentAuditRepository
      const auditRepo = {} as AssignmentAuditRepository;
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      auditRepo.create('plain-string', {} as any);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      auditRepo.listByAssignment('plain-string', 'assignment-1' as AssignmentId);
    }
  });
});
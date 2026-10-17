// biome-ignore-all format: preserve single-line calls for ts-expect-error targeting
// biome-ignore-all lint/suspicious/noExplicitAny: needed for type tests

import { describe, it } from 'vitest';
import type { AssignmentId, EventId, EventTimeBlockId, MinistryId, RoleId, UnavailableShiftId, VolunteerId } from '@/domain/branded-ids';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '@/domain/contracts/infrastructure/assignment-audit.repository';
import type { EventRepository } from '@/domain/contracts/infrastructure/event.repository';
import type { EventTimeBlockRepository } from '@/domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import type { UnavailableShiftRepository } from '@/domain/contracts/infrastructure/unavailable-shift.repository';
import type { VolunteerRepository } from '@/domain/contracts/infrastructure/volunteer.repository';








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

      // 4. UnavailableShiftRepository
      const unavailableShiftRepo = {} as UnavailableShiftRepository;
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      unavailableShiftRepo.listByVolunteerInRange('plain-string', 'volunteer-1' as VolunteerId, new Date(), new Date());
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      unavailableShiftRepo.create('plain-string', {} as any);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      unavailableShiftRepo.update('plain-string', 'availability-1' as UnavailableShiftId, {} as any);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      unavailableShiftRepo.delete('plain-string', 'availability-1' as UnavailableShiftId);

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

      // 6. EventTimeBlockRepository
      const eventTimeBlockRepo = {} as EventTimeBlockRepository;
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      eventTimeBlockRepo.getById('plain-string', 'event-time-block-1' as EventTimeBlockId);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      eventTimeBlockRepo.listByEvent('plain-string', 'event-1' as EventId);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      eventTimeBlockRepo.create('plain-string', {} as any);
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      eventTimeBlockRepo.deleteByEvent('plain-string', 'event-1' as EventId);

      // 7. AssignmentRepository
      const assignmentRepo = {} as AssignmentRepository;
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      assignmentRepo.getById('plain-string', 'assignment-1' as AssignmentId);
      // @ts-expect-error - churchId must be branded ChurchId, not a plain string
      assignmentRepo.create({ churchId: 'plain-string', input: {} as any });
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      assignmentRepo.updateStatus('plain-string', 'assignment-1' as AssignmentId, {} as any);

      // 8. AssignmentAuditRepository
      const auditRepo = {} as AssignmentAuditRepository;
      // @ts-expect-error - First parameter must be branded ChurchId, not a plain string
      auditRepo.create('plain-string', {} as any);
    }
  });
});
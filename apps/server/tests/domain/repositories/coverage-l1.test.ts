// biome-ignore-all lint/suspicious/noExplicitAny: needed for test mocks
import { describe, expect, it } from 'vitest';
import type { AssignmentRepository } from '../../../src/application/contracts/assignment.repository';
import type { AvailabilityRepository } from '../../../src/application/contracts/availability.repository';
import { AvailabilityEngine } from '../../../src/domain/availability/availability-engine';
import { Assignment } from '../../../src/domain/entities/assignment';
import { Availability } from '../../../src/domain/entities/availability';
import type { ChurchId } from '../../../src/domain/entities/church';
import type { VolunteerId } from '../../../src/domain/entities/volunteer';

describe('Coverage L1: Availability Engine Data Access', () => {
  it('should fetch all required L1 data from repositories and calculate availability', async () => {
    // 1. Mock repositories using the defined interfaces
    const mockAvailabilityRepo: AvailabilityRepository = {
      listByVolunteerInRange: async (
        churchId: ChurchId,
        volunteerId: VolunteerId,
        _startTime: Date,
        _endTime: Date,
      ) => {
        return [
          new Availability({
            churchId,
            volunteerId,
            type: 'unavailable',
            startTime: new Date('2024-06-01T10:00:00Z'),
            endTime: new Date('2024-06-01T12:00:00Z'),
            isAllDay: false,
          }),
        ];
      },
    } as any;

    const mockAssignmentRepo: AssignmentRepository = {
      listByVolunteerInRange: async (
        churchId: ChurchId,
        volunteerId: VolunteerId,
        _startTime: Date,
        _endTime: Date,
      ) => {
        return [
          new Assignment({
            churchId,
            slotId: 'slot-1' as any,
            volunteerId,
            roleId: 'role-1' as any,
            status: 'confirmed',
          }),
        ];
      },
    } as any;

    // 2. Simulate the application controller/service flow retrieving data for L1
    const churchId = 'church-1' as ChurchId;
    const volunteerId = 'volunteer-1' as VolunteerId;
    const rangeStart = new Date('2024-06-01T00:00:00Z');
    const rangeEnd = new Date('2024-06-01T23:59:59Z');

    // Retrieve availability blockouts
    const blockouts = await mockAvailabilityRepo.listByVolunteerInRange(
      churchId,
      volunteerId,
      rangeStart,
      rangeEnd,
    );

    // Retrieve existing assignments
    const assignments = await mockAssignmentRepo.listByVolunteerInRange(
      churchId,
      volunteerId,
      rangeStart,
      rangeEnd,
    );

    // 3. Map retrieved domain entities to L1 engine input types
    const engineBlockouts = blockouts.map((b) => ({
      id: b.id,
      churchId: b.churchId,
      timeRange: {
        start: b.startTime,
        end: b.endTime,
      },
      isAllDay: b.isAllDay,
    }));

    const engineAssignments = assignments.map((a) => ({
      id: a.id,
      churchId: a.churchId,
      status:
        a.status === 'draft' || a.status === 'cancelled'
          ? ('pending' as const)
          : a.status,
      timeRange: {
        // In real domain context, we would look up slot start/end.
        // For L1 test verification, we map to the engine structure.
        start: new Date('2024-06-01T11:00:00Z'),
        end: new Date('2024-06-01T12:00:00Z'),
      },
    }));

    // 4. Exercise L1 AvailabilityEngine
    const result = AvailabilityEngine.checkAvailability({
      churchId,
      volunteerId,
      timeRange: {
        start: new Date('2024-06-01T11:30:00Z'),
        end: new Date('2024-06-01T12:30:00Z'),
      },
      existingBlockouts: engineBlockouts,
      existingAssignments: engineAssignments,
    });

    expect(result.status).toBe('UNAVAILABLE'); // overlap with blockout (10:00 - 12:00)
  });
});

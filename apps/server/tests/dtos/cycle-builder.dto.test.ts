import { describe, expect, it } from 'vitest';
import { cycleBuilderResponseSchema } from '../../src/api/dtos/cycle-builder.dto';

describe('cycleBuilderResponseSchema', () => {
  it('requires a server-derived mutation capability on each requirement', () => {
    const response = {
      events: [
        {
          participation: {
            id: 'participation-1',
            churchId: 'church-1',
            ministryId: 'ministry-1',
            eventId: 'event-1',
            state: 'rostering',
          },
          event: {
            id: 'event-1',
            churchId: 'church-1',
            planningCycleId: 'cycle-1',
            title: 'Sunday Gathering',
            start: '2027-01-01T09:00:00.000Z',
            end: '2027-01-01T11:00:00.000Z',
            status: 'scheduled',
            eventType: 'hourly',
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
          slots: [
            {
              slot: {
                id: 'slot-1',
                churchId: 'church-1',
                eventId: 'event-1',
                startTime: '2027-01-01T09:00:00.000Z',
                endTime: '2027-01-01T11:00:00.000Z',
                status: 'active',
                requirements: [],
              },
              included: true,
              shifts: [
                {
                  shift: {
                    id: 'shift-1',
                    participationId: 'participation-1',
                    timeSlotId: 'slot-1',
                    startTime: '2027-01-01T09:00:00.000Z',
                    endTime: '2027-01-01T11:00:00.000Z',
                  },
                  requirements: [
                    {
                      id: 'requirement-1',
                      shiftId: 'shift-1',
                      participationId: 'participation-1',
                      roleId: 'role-1',
                      requiredCount: 1,
                      canMutateAssignments: true,
                    },
                  ],
                  assignments: [],
                  eligibleVolunteers: [],
                },
              ],
            },
          ],
        },
      ],
      roles: [{ id: 'role-1', name: 'Greeter' }],
    };

    expect(cycleBuilderResponseSchema.safeParse(response).success).toBe(true);
    const responseWithoutCapability = structuredClone(response);
    const requirement = responseWithoutCapability.events
      .at(0)
      ?.slots.at(0)
      ?.shifts.at(0)
      ?.requirements.at(0);
    if (!requirement) {
      throw new Error('Expected a Cycle Builder requirement');
    }
    Reflect.deleteProperty(requirement, 'canMutateAssignments');
    expect(
      cycleBuilderResponseSchema.safeParse(responseWithoutCapability).success,
    ).toBe(false);
  });
});

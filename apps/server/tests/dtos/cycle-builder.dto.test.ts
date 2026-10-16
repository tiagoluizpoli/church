import { describe, expect, it } from 'vitest';
import { cycleBuilderResponseSchema } from '@/api/dtos/cycle-builder.dto';

describe('cycleBuilderResponseSchema', () => {
  it('accepts a requirement without any mutation capability flag', () => {
    const response = {
      events: [
        {
          participation: {
            id: 'participation-1',
            churchId: 'church-1',
            ministryId: 'ministry-1',
            eventId: 'event-1',
            state: 'assigning',
          },
          event: {
            id: 'event-1',
            churchId: 'church-1',
            cycleId: 'cycle-1',
            title: 'Sunday Gathering',
            start: '2027-01-01T09:00:00.000Z',
            end: '2027-01-01T11:00:00.000Z',
            status: 'scheduled',
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
          eventTimeBlocks: [
            {
              eventTimeBlock: {
                id: 'event-time-block-1',
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
                    eventTimeBlockId: 'event-time-block-1',
                    startTime: '2027-01-01T09:00:00.000Z',
                    endTime: '2027-01-01T11:00:00.000Z',
                  },
                  requirements: [
                    {
                      id: 'requirement-1',
                      shiftId: 'shift-1',
                      participationId: 'participation-1',
                      roleId: 'role-1',
                      sectorId: 'sector-1',
                      sectorName: 'Palco',
                      peopleNeeded: 1,
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
  });
});

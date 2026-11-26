import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCycleBuilder } from '@/features/scheduling/hooks/use-cycle-builder';
import {
  coverageOf,
  includedShifts,
  scheduleOrdinals,
} from '@/features/scheduling/utils/builder/assignment-proposal.utils';
import { countWorkload } from '@/features/scheduling/utils/builder/cycle-builder-ranking.utils';
import {
  summarizeCycleCounts,
  summarizeCycleStaffing,
} from '@/features/scheduling/utils/builder/cycle-builder-staffing.utils';

const adminApiMock = vi.hoisted(() => ({ getCycleBuilderData: vi.fn() }));
vi.mock('@/utils/api-instances', () => ({ adminApi: adminApiMock }));

const start = '2026-07-05T09:00:00.000Z';
const end = '2026-07-05T11:00:00.000Z';

const assignments = ['draft', 'pending', 'cancelled'].map((status) => ({
  id: status,
  shiftId: 'shift-1',
  volunteerId: status,
  roleId: 'role-1',
  shiftRequirementId: 'requirement-1',
  status,
}));

function wire() {
  return {
    affectedVolunteerCount: 0,
    roles: [{ id: 'role-1', name: 'Sound' }],
    events: [
      {
        participation: { id: 'participation-1', state: 'assigning' },
        event: {
          id: 'event-1',
          title: 'Sunday',
          start,
          end,
          status: 'scheduled',
        },
        eventTimeBlocks: [
          {
            eventTimeBlock: {
              id: 'block-1',
              startTime: start,
              endTime: end,
              status: 'active',
            },
            included: true,
            shifts: [
              {
                shift: { id: 'shift-1', startTime: start, endTime: end },
                requirements: [
                  { id: 'requirement-1', roleId: 'role-1', peopleNeeded: 3 },
                ],
                assignments,
                eligibleVolunteers: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('active Assignment counts', () => {
  it('counts draft and pending, never cancelled, everywhere', async () => {
    adminApiMock.getCycleBuilderData.mockResolvedValue(wire());
    const client = new QueryClient();
    const { result } = renderHook(
      () => useCycleBuilder({ cycleId: 'cycle-1', ministryId: 'ministry-1' }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    const data = result.current.data;
    if (!data) throw new Error('no data');
    const [event] = data.events;
    const [block] = event.eventTimeBlocks;
    expect(event.assignedCount).toBe(2);
    expect(block.assignedCount).toBe(2);
    expect(block.shifts[0].assignedCount).toBe(2);
    expect(event.fillRatio).toBeCloseTo(2 / 3);
    const staffing = summarizeCycleStaffing({ data });
    expect(staffing).toEqual({
      filled: 2,
      coveredPlaces: 2,
      required: 3,
      percent: 67,
      shiftsBelowTarget: 1,
    });
    expect(
      summarizeCycleCounts({ data, assignedCount: staffing.filled })
        .assignedCount,
    ).toBe(2);
    expect([...countWorkload({ assignments: data.assignments })]).toEqual([
      ['draft', 1],
      ['pending', 1],
    ]);
    expect([...scheduleOrdinals({ data, additions: [] }).totals]).toEqual([
      ['draft', 1],
      ['pending', 1],
    ]);
    const shifts = includedShifts({ data });
    expect(coverageOf({ shifts, additions: [] })).toEqual({
      required: 3,
      before: 2,
      after: 2,
    });
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCycleBuilder } from './use-cycle-builder';
import type {
  GetCycleBuilderData200,
  GetCycleBuilderData200EventsItemSlotsItemShiftsItemAssignmentsItem,
} from '@/infrastructure/api/churchAPI.schemas';

const adminApiMock = vi.hoisted(() => ({
  getCycleBuilderData: vi.fn(),
  createParticipationAssignment: vi.fn(),
  deleteParticipationAssignment: vi.fn(),
  reassignParticipationAssignment: vi.fn(),
}));

vi.mock('@/utils/api-instances', () => ({ adminApi: adminApiMock }));

type RawAssignment =
  GetCycleBuilderData200EventsItemSlotsItemShiftsItemAssignmentsItem;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function defer<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const ANA_ASSIGNMENT: RawAssignment = {
  id: 'assignment-1',
  churchId: 'church-1',
  slotId: 'slot-1',
  participationId: 'participation-1',
  shiftId: 'shift-1',
  volunteerId: 'ana',
  roleId: 'role-1',
  status: 'confirmed',
  assignedAt: '2026-07-01T10:00:00.000Z',
};

function makeCycleBuilderData(): GetCycleBuilderData200 {
  return {
    roles: [{ id: 'role-1', name: 'Sound' }],
    events: [
      {
        participation: {
          id: 'participation-1',
          churchId: 'church-1',
          eventId: 'event-1',
          ministryId: 'ministry-1',
          state: 'rostering',
        },
        event: {
          id: 'event-1',
          churchId: 'church-1',
          planningCycleId: 'cycle-1',
          title: 'Sunday service',
          startDate: '2026-07-05T09:00:00.000Z',
          endDate: '2026-07-05T11:00:00.000Z',
          status: 'scheduled',
          eventType: 'hourly',
          createdAt: '2026-07-01T09:00:00.000Z',
          updatedAt: '2026-07-01T09:00:00.000Z',
        },
        slots: [
          {
            slot: {
              id: 'slot-1',
              churchId: 'church-1',
              eventId: 'event-1',
              startTime: '2026-07-05T09:00:00.000Z',
              endTime: '2026-07-05T11:00:00.000Z',
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
                  startTime: '2026-07-05T09:00:00.000Z',
                  endTime: '2026-07-05T11:00:00.000Z',
                },
                requirements: [
                  {
                    id: 'requirement-1',
                    shiftId: 'shift-1',
                    participationId: 'participation-1',
                    roleId: 'role-1',
                    requiredCount: 2,
                  },
                ],
                assignments: [ANA_ASSIGNMENT],
                eligibleVolunteers: [
                  {
                    volunteerId: 'ana',
                    volunteerName: 'Ana',
                    isAvailable: true,
                    hasConflict: false,
                    qualifiedRoleIds: ['role-1'],
                  },
                  {
                    volunteerId: 'bruno',
                    volunteerName: 'Bruno',
                    isAvailable: true,
                    hasConflict: false,
                    qualifiedRoleIds: ['role-1'],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

interface WrapperProps {
  children: ReactNode;
}

function renderCycleBuilder() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: WrapperProps) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => useCycleBuilder({ cycleId: 'cycle-1', ministryId: 'ministry-1' }),
    { wrapper },
  );
}

function assignedVolunteerIds(
  assignments: { volunteerId: string }[],
): string[] {
  return assignments.map((assignment) => assignment.volunteerId).sort();
}

beforeEach(() => {
  vi.clearAllMocks();
  adminApiMock.getCycleBuilderData.mockResolvedValue(makeCycleBuilderData());
});

describe('useCycleBuilder optimistic assignments', () => {
  it('shows a created assignment before the server answers', async () => {
    const pendingCreate = defer<unknown>();
    adminApiMock.createParticipationAssignment.mockReturnValue(
      pendingCreate.promise,
    );
    const { result } = renderCycleBuilder();
    await waitFor(() => expect(result.current.data).toBeDefined());

    void result.current.createAssignment.mutateAsync({
      shiftId: 'shift-1',
      body: { volunteerId: 'bruno', roleId: 'role-1' },
    });

    await waitFor(() =>
      expect(
        assignedVolunteerIds(result.current.data?.assignments ?? []),
      ).toEqual(['ana', 'bruno']),
    );
    // The counts the board renders come from the same cache write.
    expect(result.current.data?.events[0].assignedCount).toBe(2);
    // Names resolve from the shift's eligible list, so the card is not blank.
    expect(
      result.current.data?.assignments.find(
        (assignment) => assignment.volunteerId === 'bruno',
      )?.volunteerName,
    ).toBe('Bruno');

    pendingCreate.resolve({});
  });

  it('rolls the created assignment back when the server rejects it', async () => {
    const pendingCreate = defer<unknown>();
    adminApiMock.createParticipationAssignment.mockReturnValue(
      pendingCreate.promise,
    );
    const { result } = renderCycleBuilder();
    await waitFor(() => expect(result.current.data).toBeDefined());

    const mutation = result.current.createAssignment.mutateAsync({
      shiftId: 'shift-1',
      body: { volunteerId: 'bruno', roleId: 'role-1' },
    });
    await waitFor(() =>
      expect(result.current.data?.assignments).toHaveLength(2),
    );

    pendingCreate.reject(new Error('Volunteer is not qualified'));
    await expect(mutation).rejects.toThrow('Volunteer is not qualified');

    await waitFor(() =>
      expect(
        assignedVolunteerIds(result.current.data?.assignments ?? []),
      ).toEqual(['ana']),
    );
  });

  it('drops a removed assignment before the server answers', async () => {
    const pendingDelete = defer<unknown>();
    adminApiMock.deleteParticipationAssignment.mockReturnValue(
      pendingDelete.promise,
    );
    const { result } = renderCycleBuilder();
    await waitFor(() => expect(result.current.data).toBeDefined());

    void result.current.deleteAssignment.mutateAsync('assignment-1');

    await waitFor(() =>
      expect(result.current.data?.assignments).toHaveLength(0),
    );

    pendingDelete.resolve({});
  });

  it('swaps the volunteer of a reassigned assignment before the server answers', async () => {
    const pendingReassign = defer<unknown>();
    adminApiMock.reassignParticipationAssignment.mockReturnValue(
      pendingReassign.promise,
    );
    const { result } = renderCycleBuilder();
    await waitFor(() => expect(result.current.data).toBeDefined());

    void result.current.reassignAssignment.mutateAsync({
      assignmentId: 'assignment-1',
      body: { volunteerId: 'bruno', reason: 'Swapped in the cycle builder' },
    });

    await waitFor(() =>
      expect(
        assignedVolunteerIds(result.current.data?.assignments ?? []),
      ).toEqual(['bruno']),
    );

    pendingReassign.resolve({});
  });
});

// @vitest-environment jsdom

import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CycleBuilderAssignment,
  CycleBuilderData,
} from '@/features/scheduling/hooks/use-cycle-builder';
import {
  type CycleBuilderMutations,
  useCycleBuilderActions,
} from '@/features/scheduling/hooks/use-cycle-builder-actions';

function assignment(
  overrides: Partial<CycleBuilderAssignment> &
    Pick<CycleBuilderAssignment, 'id' | 'volunteerId'>,
): CycleBuilderAssignment {
  return {
    churchId: 'church-1',
    eventTimeBlockId: 'event-time-block-1',
    shiftId: 'shift-1',
    roleId: 'role-1',
    shiftRequirementId: 'requirement-role-1',
    status: 'confirmed',
    assignedAt: '2027-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function dataWithAssignments(
  assignments: CycleBuilderAssignment[],
): CycleBuilderData {
  return {
    assignments,
    roles: [{ id: 'role-1', name: 'Sound' }],
    events: [
      {
        participationId: 'participation-1',
        state: 'assigning',
        eventId: 'event-1',
        title: 'Sunday service',
        start: '2027-01-04T03:00:00.000Z',
        end: '2027-01-05T02:59:59.999Z',
        status: 'draft',
        fillRatio: 0,
        peopleNeeded: 1,
        assignedCount: assignments.length,
        eventTimeBlockCount: 1,
        eventTimeBlocks: [
          {
            eventTimeBlockId: 'event-time-block-1',
            label: 'Morning',
            startTime: '2027-01-04T12:00:00.000Z',
            endTime: '2027-01-04T13:00:00.000Z',
            included: true,
            peopleNeeded: 1,
            assignedCount: assignments.length,
            shiftCount: 1,
            shifts: [
              {
                shiftId: 'shift-1',
                eventTimeBlockId: 'event-time-block-1',
                label: 'Morning',
                startTime: '2027-01-04T12:00:00.000Z',
                endTime: '2027-01-04T13:00:00.000Z',
                peopleNeeded: 1,
                assignedCount: assignments.length,
                requirements: [
                  {
                    id: 'requirement-role-1',
                    roleId: 'role-1',
                    sectorName: 'Main',
                    peopleNeeded: 1,
                  },
                ],
                assignments,
                eligibleVolunteerCount: 2,
                eligibleVolunteers: [
                  {
                    volunteerId: 'volunteer-a',
                    volunteerName: 'Volunteer A',
                    answerState: 'available',
                    conflict: null,
                    qualifiedRoleIds: ['role-1'],
                    ministryAccessLevel: 'volunteer',
                  },
                  {
                    volunteerId: 'volunteer-b',
                    volunteerName: 'Volunteer B',
                    answerState: 'unavailable',
                    conflict: null,
                    qualifiedRoleIds: ['role-1'],
                    ministryAccessLevel: 'volunteer',
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

function mutations(): CycleBuilderMutations {
  return {
    createAssignment: { isPending: false, mutateAsync: vi.fn() },
    deleteAssignment: { isPending: false, mutateAsync: vi.fn() },
    reassignAssignment: { isPending: false, mutateAsync: vi.fn() },
  };
}

describe('useCycleBuilderActions', () => {
  afterEach(() => overwriteGetLocale(() => 'en'));

  it('announces assignment and removal outcomes in Portuguese', async () => {
    overwriteGetLocale(() => 'pt-BR');
    const writes = mutations();
    const { result } = renderHook(() =>
      useCycleBuilderActions({ data: dataWithAssignments([]), ...writes }),
    );
    act(() =>
      result.current.handleSelectAssignment({
        shiftId: 'shift-1',
        shiftRequirementId: 'requirement-role-1',
        roleId: 'role-1',
        volunteerId: 'volunteer-a',
      }),
    );
    await waitFor(() =>
      expect(result.current.announcement).toBe(
        m.builder_logic_assigned({
          volunteerName: 'Volunteer A',
          eventTimeBlockLabel: m.builder_logic_this_shift(),
        }),
      ),
    );
    await act(async () => {
      await result.current.removeAssignment({
        assignmentId: 'assignment-1',
        volunteerName: 'Volunteer A',
      });
    });
    expect(result.current.announcement).toBe(
      m.builder_logic_removed({ volunteerName: 'Volunteer A' }),
    );
  });

  it('announces localized refusals and fallback failures in Portuguese', async () => {
    overwriteGetLocale(() => 'pt-BR');
    const writes = mutations();
    vi.mocked(writes.createAssignment.mutateAsync).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Escala recusada' } },
    });
    vi.mocked(writes.deleteAssignment.mutateAsync).mockRejectedValue(
      new Error('Network Error'),
    );
    const { result } = renderHook(() =>
      useCycleBuilderActions({ data: dataWithAssignments([]), ...writes }),
    );
    act(() =>
      result.current.handleSelectAssignment({
        shiftId: 'shift-1',
        shiftRequirementId: 'requirement-role-1',
        roleId: 'role-1',
        volunteerId: 'volunteer-a',
      }),
    );
    await waitFor(() =>
      expect(result.current.announcement).toBe(
        m.builder_logic_assign_failed({
          volunteerName: 'Volunteer A',
          eventTimeBlockLabel: m.builder_logic_this_shift(),
          message: 'Escala recusada',
        }),
      ),
    );
    await act(async () => {
      await result.current.removeAssignment({
        assignmentId: 'assignment-1',
        volunteerName: 'Volunteer A',
      });
    });
    expect(result.current.announcement).toBe(
      m.builder_logic_remove_failed({
        volunteerName: 'Volunteer A',
        message: m.common_removal_failed(),
      }),
    );
  });

  it('keeps another Sector failure when retrying the same Volunteer and Role in one Shift', async () => {
    const writes = mutations();
    const create = vi.mocked(writes.createAssignment.mutateAsync);
    create
      .mockRejectedValueOnce(new Error('First Sector failed'))
      .mockRejectedValueOnce(new Error('Second Sector failed'))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useCycleBuilderActions({ data: dataWithAssignments([]), ...writes }),
    );
    act(() =>
      result.current.handleSelectAssignment({
        shiftId: 'shift-1',
        shiftRequirementId: 'babies-requirement',
        roleId: 'role-1',
        volunteerId: 'volunteer-b',
      }),
    );
    await waitFor(() => expect(result.current.failedWrites).toHaveLength(1));
    act(() =>
      result.current.handleSelectAssignment({
        shiftId: 'shift-1',
        shiftRequirementId: 'kids-requirement',
        roleId: 'role-1',
        volunteerId: 'volunteer-b',
      }),
    );
    await waitFor(() => expect(result.current.failedWrites).toHaveLength(2));
    const failed = result.current.failedWrites.find(
      ({ failedWrite }) =>
        failedWrite.shiftRequirementId === 'babies-requirement',
    );
    if (!failed) throw new Error('Missing failed Assignment');
    act(() =>
      result.current.retryFailedWrite(failed.failedWrite.failedWriteId),
    );
    await waitFor(() => expect(create).toHaveBeenCalledTimes(3));
    expect(create).toHaveBeenLastCalledWith({
      shiftId: 'shift-1',
      body: {
        volunteerId: 'volunteer-b',
        shiftRequirementId: 'babies-requirement',
      },
    });
    await waitFor(() => expect(result.current.failedWrites).toHaveLength(1));
    expect(result.current.failedWrites[0]?.failedWrite.shiftRequirementId).toBe(
      'kids-requirement',
    );
  });

  it('reassigns an existing assignment once the override is confirmed', async () => {
    const writes = mutations();
    const { result } = renderHook(() =>
      useCycleBuilderActions({
        data: dataWithAssignments([
          assignment({ id: 'assignment-1', volunteerId: 'old' }),
        ]),
        ...writes,
      }),
    );

    act(() =>
      result.current.handleSelectAssignment({
        shiftId: 'shift-1',
        shiftRequirementId: 'requirement-role-1',
        roleId: 'role-1',
        volunteerId: 'volunteer-b',
        volunteerName: 'Volunteer B',
        assignmentId: 'assignment-1',
        unavailable: true,
      }),
    );

    expect(result.current.unavailable).not.toBeNull();
    act(() => result.current.confirmUnavailable());

    await waitFor(() =>
      expect(writes.reassignAssignment.mutateAsync).toHaveBeenCalledWith({
        assignmentId: 'assignment-1',
        body: { volunteerId: 'volunteer-b' },
      }),
    );
  });

  it('does not treat an optimistic assignment as a server collision source', async () => {
    const writes = mutations();
    const { result } = renderHook(() =>
      useCycleBuilderActions({
        data: dataWithAssignments([
          assignment({
            id: 'optimistic:assignment-1',
            volunteerId: 'volunteer-b',
          }),
        ]),
        ...writes,
      }),
    );

    act(() =>
      result.current.handleSelectAssignment({
        shiftId: 'shift-1',
        shiftRequirementId: 'requirement-role-1',
        roleId: 'role-1',
        volunteerId: 'volunteer-b',
        volunteerName: 'Volunteer B',
      }),
    );

    await waitFor(() =>
      expect(writes.createAssignment.mutateAsync).toHaveBeenCalled(),
    );
    expect(writes.deleteAssignment.mutateAsync).not.toHaveBeenCalled();
  });
});

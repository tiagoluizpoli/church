// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  CycleBuilderAssignment,
  CycleBuilderData,
} from './use-cycle-builder';
import {
  type CycleBuilderMutations,
  useCycleBuilderActions,
} from './use-cycle-builder-actions';

function assignment(
  overrides: Partial<CycleBuilderAssignment> &
    Pick<CycleBuilderAssignment, 'id' | 'volunteerId'>,
): CycleBuilderAssignment {
  return {
    churchId: 'church-1',
    slotId: 'slot-1',
    shiftId: 'shift-1',
    roleId: 'role-1',
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
        state: 'rostering',
        eventId: 'event-1',
        title: 'Sunday service',
        startDate: '2027-01-04T03:00:00.000Z',
        endDate: '2027-01-05T02:59:59.999Z',
        status: 'draft',
        eventType: 'hourly',
        fillRatio: 0,
        requiredCount: 1,
        assignedCount: assignments.length,
        slotCount: 1,
        slots: [
          {
            slotId: 'slot-1',
            label: 'Morning',
            startTime: '2027-01-04T12:00:00.000Z',
            endTime: '2027-01-04T13:00:00.000Z',
            included: true,
            requiredCount: 1,
            assignedCount: assignments.length,
            shiftCount: 1,
            shifts: [
              {
                shiftId: 'shift-1',
                slotId: 'slot-1',
                label: 'Morning',
                startTime: '2027-01-04T12:00:00.000Z',
                endTime: '2027-01-04T13:00:00.000Z',
                requiredCount: 1,
                assignedCount: assignments.length,
                requirements: [{ roleId: 'role-1', requiredCount: 1 }],
                assignments,
                eligibleVolunteerCount: 2,
                eligibleVolunteers: [
                  {
                    volunteerId: 'volunteer-a',
                    volunteerName: 'Volunteer A',
                    isAvailable: true,
                    hasConflict: false,
                    qualifiedRoleIds: ['role-1'],
                  },
                  {
                    volunteerId: 'volunteer-b',
                    volunteerName: 'Volunteer B',
                    isAvailable: false,
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

function mutations(): CycleBuilderMutations {
  return {
    createAssignment: { isPending: false, mutateAsync: vi.fn() },
    deleteAssignment: { isPending: false, mutateAsync: vi.fn() },
    reassignAssignment: { isPending: false, mutateAsync: vi.fn() },
  };
}

describe('useCycleBuilderActions', () => {
  it('propagates an override reason when replacing an existing assignment', async () => {
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
        roleId: 'role-1',
        volunteerId: 'volunteer-b',
        volunteerName: 'Volunteer B',
        assignmentId: 'assignment-1',
        conflictType: 'unavailable',
      }),
    );

    expect(result.current.override).not.toBeNull();
    act(() => result.current.confirmOverride('Leader approved the exception'));

    await waitFor(() =>
      expect(writes.reassignAssignment.mutateAsync).toHaveBeenCalledWith({
        assignmentId: 'assignment-1',
        body: {
          volunteerId: 'volunteer-b',
          reason: 'Leader approved the exception',
        },
      }),
    );
  });

  it('requires and preserves a reason before moving a conflicted volunteer', async () => {
    const writes = mutations();
    const source = assignment({
      id: 'source-assignment',
      volunteerId: 'volunteer-b',
    });
    const { result } = renderHook(() =>
      useCycleBuilderActions({
        data: dataWithAssignments([source]),
        ...writes,
      }),
    );

    act(() =>
      result.current.handleSelectAssignment({
        shiftId: 'shift-1',
        roleId: 'role-1',
        volunteerId: 'volunteer-b',
        volunteerName: 'Volunteer B',
        conflictType: 'unavailable',
      }),
    );
    expect(result.current.collision).not.toBeNull();

    await act(async () => {
      await result.current.applyCollision({ action: 'move' });
    });
    expect(result.current.override).not.toBeNull();

    act(() => result.current.confirmOverride('Leader approved the move'));
    await waitFor(() =>
      expect(writes.createAssignment.mutateAsync).toHaveBeenCalledWith({
        shiftId: 'shift-1',
        body: {
          volunteerId: 'volunteer-b',
          roleId: 'role-1',
          override: { reason: 'Leader approved the move' },
        },
      }),
    );
    expect(writes.deleteAssignment.mutateAsync).toHaveBeenCalledWith(
      'source-assignment',
    );
  });

  it('requires a reason for a conflicted swap leg and sends it to both writes', async () => {
    const writes = mutations();
    const source = assignment({
      id: 'source-assignment',
      volunteerId: 'volunteer-a',
      shiftId: 'source-shift',
    });
    const target = assignment({
      id: 'target-assignment',
      volunteerId: 'volunteer-b',
    });
    const data = dataWithAssignments([source, target]);
    const sourceShift = data.events[0]?.slots[0]?.shifts[0];
    if (!sourceShift) throw new Error('Test shift missing');
    sourceShift.shiftId = 'source-shift';
    sourceShift.assignments = [source];
    sourceShift.eligibleVolunteers = sourceShift.eligibleVolunteers.map(
      (volunteer) =>
        volunteer.volunteerId === 'volunteer-b'
          ? { ...volunteer, hasConflict: true }
          : volunteer,
    );

    const { result } = renderHook(() =>
      useCycleBuilderActions({ data, ...writes }),
    );
    act(() =>
      result.current.handleSelectAssignment({
        shiftId: 'shift-1',
        roleId: 'role-1',
        volunteerId: 'volunteer-a',
        assignmentId: 'target-assignment',
        conflictType: undefined,
      }),
    );
    await act(async () => {
      await result.current.applyCollision({ action: 'swap' });
    });
    expect(result.current.override).not.toBeNull();

    act(() => result.current.confirmOverride('Leader approved the swap'));
    await waitFor(() =>
      expect(writes.reassignAssignment.mutateAsync).toHaveBeenNthCalledWith(1, {
        assignmentId: 'source-assignment',
        body: {
          volunteerId: 'volunteer-b',
          reason: 'Leader approved the swap',
        },
      }),
    );
    expect(writes.reassignAssignment.mutateAsync).toHaveBeenNthCalledWith(2, {
      assignmentId: 'target-assignment',
      body: {
        volunteerId: 'volunteer-a',
        reason: 'Leader approved the swap',
      },
    });
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
        roleId: 'role-1',
        volunteerId: 'volunteer-b',
        volunteerName: 'Volunteer B',
      }),
    );

    await waitFor(() =>
      expect(writes.createAssignment.mutateAsync).toHaveBeenCalled(),
    );
    expect(result.current.collision).toBeNull();
    expect(writes.deleteAssignment.mutateAsync).not.toHaveBeenCalled();
  });
});

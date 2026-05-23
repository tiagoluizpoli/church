import { describe, expect, it } from 'vitest';
import { AvailabilityEngine } from '../../src/domain/availability/availability-engine';
import type {
  AssignmentContext,
  AvailabilityCheckRequest,
  BlockoutContext,
} from '../../src/domain/availability/types';

describe('AvailabilityEngine', () => {
  const churchId = 'chu_123';
  const volunteerId = 'vol_123';

  const createRequest = (
    start: Date,
    end: Date,
    blockouts: BlockoutContext[] = [],
    assignments: AssignmentContext[] = [],
    excludeAssignmentId?: string,
  ): AvailabilityCheckRequest => ({
    churchId,
    volunteerId,
    timeRange: { start, end },
    existingBlockouts: blockouts,
    existingAssignments: assignments,
    excludeAssignmentId,
  });

  it('should return AVAILABLE when there are no blockouts or assignments', () => {
    const request = createRequest(
      new Date('2026-05-20T09:00:00Z'),
      new Date('2026-05-20T10:00:00Z'),
    );
    const result = AvailabilityEngine.checkAvailability(request);
    expect(result.status).toBe('AVAILABLE');
  });

  it('should return UNAVAILABLE when there is a blockout conflict', () => {
    const blockout: BlockoutContext = {
      id: 'blk_1',
      churchId,
      timeRange: {
        start: new Date('2026-05-20T08:00:00Z'),
        end: new Date('2026-05-20T10:00:00Z'),
      },
      isAllDay: false,
    };
    const request = createRequest(
      new Date('2026-05-20T09:00:00Z'),
      new Date('2026-05-20T11:00:00Z'),
      [blockout],
    );
    const result = AvailabilityEngine.checkAvailability(request);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.conflictReason).toBe('blockout');
    expect(result.conflictingId).toBe('blk_1');
  });

  it('should return DOUBLE_BOOKED when there is an assignment conflict', () => {
    const assignment: AssignmentContext = {
      id: 'asg_1',
      churchId,
      timeRange: {
        start: new Date('2026-05-20T08:00:00Z'),
        end: new Date('2026-05-20T10:00:00Z'),
      },
      status: 'confirmed',
    };
    const request = createRequest(
      new Date('2026-05-20T09:00:00Z'),
      new Date('2026-05-20T11:00:00Z'),
      [],
      [assignment],
    );
    const result = AvailabilityEngine.checkAvailability(request);
    expect(result.status).toBe('DOUBLE_BOOKED');
    expect(result.conflictReason).toBe('assignment');
    expect(result.conflictingId).toBe('asg_1');
  });

  it('should return AVAILABLE when assignment is declined', () => {
    const assignment: AssignmentContext = {
      id: 'asg_1',
      churchId,
      timeRange: {
        start: new Date('2026-05-20T08:00:00Z'),
        end: new Date('2026-05-20T10:00:00Z'),
      },
      status: 'declined',
    };
    const request = createRequest(
      new Date('2026-05-20T09:00:00Z'),
      new Date('2026-05-20T11:00:00Z'),
      [],
      [assignment],
    );
    const result = AvailabilityEngine.checkAvailability(request);
    expect(result.status).toBe('AVAILABLE');
  });

  it('should return AVAILABLE for back-to-back shifts', () => {
    const blockout: BlockoutContext = {
      id: 'blk_1',
      churchId,
      timeRange: {
        start: new Date('2026-05-20T08:00:00Z'),
        end: new Date('2026-05-20T09:00:00Z'),
      },
      isAllDay: false,
    };
    const request = createRequest(
      new Date('2026-05-20T09:00:00Z'),
      new Date('2026-05-20T10:00:00Z'),
      [blockout],
    );
    const result = AvailabilityEngine.checkAvailability(request);
    expect(result.status).toBe('AVAILABLE');
  });

  it('should handle crossing midnight', () => {
    const assignment: AssignmentContext = {
      id: 'asg_1',
      churchId,
      timeRange: {
        start: new Date('2026-05-20T23:00:00Z'),
        end: new Date('2026-05-21T01:00:00Z'),
      },
      status: 'confirmed',
    };
    const request = createRequest(
      new Date('2026-05-21T00:00:00Z'),
      new Date('2026-05-21T02:00:00Z'),
      [],
      [assignment],
    );
    const result = AvailabilityEngine.checkAvailability(request);
    expect(result.status).toBe('DOUBLE_BOOKED');
  });

  it('should handle pre-calculated all-day boundaries', () => {
    const blockout: BlockoutContext = {
      id: 'blk_all_day',
      churchId,
      timeRange: {
        start: new Date('2026-05-20T00:00:00Z'),
        end: new Date('2026-05-20T23:59:59Z'),
      },
      isAllDay: true,
    };
    const request = createRequest(
      new Date('2026-05-20T10:00:00Z'),
      new Date('2026-05-20T11:00:00Z'),
      [blockout],
    );
    const result = AvailabilityEngine.checkAvailability(request);
    expect(result.status).toBe('UNAVAILABLE');
  });

  it('should throw error on churchId isolation breach in blockouts', () => {
    const blockout: BlockoutContext = {
      id: 'blk_1',
      churchId: 'other_church',
      timeRange: {
        start: new Date('2026-05-20T08:00:00Z'),
        end: new Date('2026-05-20T10:00:00Z'),
      },
      isAllDay: false,
    };
    const request = createRequest(
      new Date('2026-05-20T09:00:00Z'),
      new Date('2026-05-20T11:00:00Z'),
      [blockout],
    );
    expect(() => AvailabilityEngine.checkAvailability(request)).toThrow(
      'Isolation breach',
    );
  });

  it('should throw error on churchId isolation breach in assignments', () => {
    const assignment: AssignmentContext = {
      id: 'asg_1',
      churchId: 'other_church',
      timeRange: {
        start: new Date('2026-05-20T08:00:00Z'),
        end: new Date('2026-05-20|10:00:00Z'),
      },
      status: 'confirmed',
    };
    const request = createRequest(
      new Date('2026-05-20T09:00:00Z'),
      new Date('2026-05-20T11:00:00Z'),
      [],
      [assignment],
    );
    expect(() => AvailabilityEngine.checkAvailability(request)).toThrow(
      'Isolation breach',
    );
  });

  describe('User Story 2: excludeAssignmentId', () => {
    it('should return AVAILABLE when the only conflict is the excluded assignment', () => {
      const assignment: AssignmentContext = {
        id: 'asg_A',
        churchId,
        timeRange: {
          start: new Date('2026-05-20T09:00:00Z'),
          end: new Date('2026-05-20T11:00:00Z'),
        },
        status: 'confirmed',
      };
      const request = createRequest(
        new Date('2026-05-20T09:00:00Z'),
        new Date('2026-05-20T11:00:00Z'),
        [],
        [assignment],
        'asg_A',
      );
      const result = AvailabilityEngine.checkAvailability(request);
      expect(result.status).toBe('AVAILABLE');
    });

    it('should return DOUBLE_BOOKED when there is another conflict besides the excluded one', () => {
      const assignmentA: AssignmentContext = {
        id: 'asg_A',
        churchId,
        timeRange: {
          start: new Date('2026-05-20T09:00:00Z'),
          end: new Date('2026-05-20T11:00:00Z'),
        },
        status: 'confirmed',
      };
      const assignmentB: AssignmentContext = {
        id: 'asg_B',
        churchId,
        timeRange: {
          start: new Date('2026-05-20T10:00:00Z'),
          end: new Date('2026-05-20T12:00:00Z'),
        },
        status: 'confirmed',
      };
      const request = createRequest(
        new Date('2026-05-20T09:00:00Z'),
        new Date('2026-05-20T11:00:00Z'),
        [],
        [assignmentA, assignmentB],
        'asg_A',
      );
      const result = AvailabilityEngine.checkAvailability(request);
      expect(result.status).toBe('DOUBLE_BOOKED');
      expect(result.conflictingId).toBe('asg_B');
    });
  });
});

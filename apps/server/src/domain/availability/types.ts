import type { Instant } from '@church/time';

export type TimeRange = {
  start: Instant;
  end: Instant;
};

export type BlockoutContext = {
  id: string;
  churchId: string;
  volunteerId?: string;
  timeRange: TimeRange;
  isAllDay: boolean; // For reference, though start/end must be pre-calculated
};

export type AssignmentContext = {
  id: string;
  churchId: string;
  volunteerId?: string;
  timeRange: TimeRange;
  status: 'pending' | 'confirmed' | 'declined';
};

export type AvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'DOUBLE_BOOKED';

export type AvailabilityResult = {
  status: AvailabilityStatus;
  conflictReason?: 'blockout' | 'assignment';
  conflictingId?: string;
};

export type AvailabilityCheckRequest = {
  churchId: string;
  volunteerId: string;
  timeRange: TimeRange;
  excludeAssignmentId?: string;
  existingBlockouts: BlockoutContext[];
  existingAssignments: AssignmentContext[];
};

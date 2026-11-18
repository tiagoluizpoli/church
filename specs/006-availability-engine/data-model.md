# Data Model: Availability Engine

This document outlines the Domain boundaries necessary for the engine. Note that these are purely TS interfaces/types, devoid of Drizzle or ORM logic.

## Types

```typescript
export type TimeRange = {
  start: Date;
  end: Date;
};

export type BlockoutContext = {
  id: string;
  churchId: string;
  timeRange: TimeRange;
  isAllDay: boolean; // For reference, though start/end must be pre-calculated
};

export type AssignmentContext = {
  id: string;
  churchId: string;
  timeRange: TimeRange;
  status: "pending" | "confirmed" | "declined";
};

export type AvailabilityStatus = "AVAILABLE" | "UNAVAILABLE" | "DOUBLE_BOOKED";

export type AvailabilityResult = {
  status: AvailabilityStatus;
  conflictReason?: "blockout" | "assignment";
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
```

## Logic State Transitions

1. **Start**: Assume `AVAILABLE`.
2. **Check Blockouts**: Iterate through `existingBlockouts`. 
   - If `blockout.churchId !== request.churchId`, throw Error (Isolation breach).
   - If `Math.max(request.start, blockout.start) < Math.min(request.end, blockout.end)`, return `UNAVAILABLE`.
3. **Check Assignments**: Iterate through `existingAssignments`.
   - If `assignment.churchId !== request.churchId`, throw Error (Isolation breach).
   - If `assignment.id === request.excludeAssignmentId`, continue (skip).
   - If `assignment.status === "declined"`, continue (skip).
   - If `Math.max(request.start, assignment.start) < Math.min(request.end, assignment.end)`, return `DOUBLE_BOOKED`.
4. **End**: If loop completes without returns, return `AVAILABLE`.

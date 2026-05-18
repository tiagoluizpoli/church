# Quickstart: Slot & Assignment Manager

The Slot & Assignment Manager is a pure Domain Service. Like the Availability Engine and Conflict Validation Service, it receives all data through function arguments — no database access, no side effects.

## Usage Example: Full Schedule Lifecycle

```typescript
import { AssignmentManagerService } from '../assignment/assignment-manager-service';
import { Event } from '../entities/event';
import { Assignment } from '../entities/assignment';
import type { SlotGenerationRequest, PublishRequest } from '../assignment/types';

// ──────────────────────────────────────────────
// Step 1: Create an Event
// ──────────────────────────────────────────────
const event = new Event({
  churchId: 'chu_123',
  ministryId: 'min_789',
  title: 'Sunday Worship Service',
  startDate: new Date('2026-06-01T08:00:00Z'),
  endDate: new Date('2026-06-01T12:00:00Z'),
});

// ──────────────────────────────────────────────
// Step 2: Generate Slots (Equal Split — 1 hour each)
// ──────────────────────────────────────────────
const genResult = AssignmentManagerService.generateSlots({
  churchId: 'chu_123',
  eventId: event.id,
  eventStartTime: event.startDate,
  eventEndTime: event.endDate,
  strategy: { kind: 'equal-split', slotDurationMinutes: 60 },
});

console.log(genResult.totalCount); // 4 slots × 1 hour each
console.log(genResult.hasRemainder); // false (exact division)

// ──────────────────────────────────────────────
// Step 3: Create Assignments (they start as 'draft')
// ──────────────────────────────────────────────
const assignments = genResult.slots.map((gs) =>
  new Assignment({
    churchId: 'chu_123',
    slotId: gs.slot.id,
    volunteerId: 'vol_001',
    roleId: 'role_vocalist',
  })
);
// assignments[0].status === 'draft'

// ──────────────────────────────────────────────
// Step 4: Publish (draft → published, draft → pending)
// ──────────────────────────────────────────────
const publishResult = AssignmentManagerService.publish({
  churchId: 'chu_123',
  event,
  assignments,
  now: new Date(),
  assignmentValidationData: new Map(/* per-assignment hard constraint data */),
});

console.log(event.status); // 'published'
console.log(assignments[0].status); // 'pending'
console.log(publishResult.transitionedCount); // 4

// ──────────────────────────────────────────────
// Step 5: Volunteer Confirms
// ──────────────────────────────────────────────
const audit = AssignmentManagerService.confirmAssignment({
  churchId: 'chu_123',
  assignment: assignments[0],
  actorId: 'vol_001',
  now: new Date(),
});
// assignments[0].status === 'confirmed'
// audit.action === 'status_change'

// ──────────────────────────────────────────────
// Step 6: Volunteer Declines (another assignment)
// ──────────────────────────────────────────────
const declineAudit = AssignmentManagerService.declineAssignment({
  churchId: 'chu_123',
  assignment: assignments[1],
  reason: 'Family emergency',
  actorId: 'vol_001',
  now: new Date(),
});
// assignments[1].status === 'declined'
// declineAudit.reason === 'Family emergency'

// ──────────────────────────────────────────────
// Step 7: Find Replacement for Declined Slot
// ──────────────────────────────────────────────
const candidates = AssignmentManagerService.findReplacements({
  churchId: 'chu_123',
  slotId: assignments[1].slotId,
  roleId: 'role_vocalist',
  slotTimeRange: { start: genResult.slots[1].slot.startTime, end: genResult.slots[1].slot.endTime },
  qualifiedVolunteerIds: ['vol_002', 'vol_003', 'vol_004'],
  declinedVolunteerIds: ['vol_001'],
  existingAssignments: /* fetched from repo */,
  existingBlockouts: /* fetched from repo */,
  workloadMap: new Map([['vol_002', 3], ['vol_003', 1], ['vol_004', 2]]),
});
// candidates === [{ volunteerId: 'vol_003', workloadCount: 1 }, { volunteerId: 'vol_004', workloadCount: 2 }, ...]
// Sorted ascending by workload

// ──────────────────────────────────────────────
// Step 8: Cancel Event (if needed)
// ──────────────────────────────────────────────
const cancelResult = AssignmentManagerService.cancelEvent({
  churchId: 'chu_123',
  event,
  slots: genResult.slots.map((gs) => gs.slot),
  assignments,
});
// event.status === 'cancelled'
// All slots and non-draft assignments → 'cancelled'
```

## Template-Based Slot Generation

```typescript
const templateResult = AssignmentManagerService.generateSlots({
  churchId: 'chu_123',
  eventId: event.id,
  eventStartTime: event.startDate,
  eventEndTime: event.endDate,
  strategy: {
    kind: 'template-based',
    periods: [
      {
        label: 'Pre-service',
        startTime: new Date('2026-06-01T08:00:00Z'),
        endTime: new Date('2026-06-01T08:30:00Z'),
        requirements: [{ roleId: 'role_usher', requiredCount: 2 }],
      },
      {
        label: 'Service',
        startTime: new Date('2026-06-01T08:30:00Z'),
        endTime: new Date('2026-06-01T10:30:00Z'),
        requirements: [
          { roleId: 'role_vocalist', requiredCount: 3 },
          { roleId: 'role_sound_tech', requiredCount: 1 },
        ],
      },
      {
        label: 'Cleanup',
        startTime: new Date('2026-06-01T10:30:00Z'),
        endTime: new Date('2026-06-01T11:00:00Z'),
      },
    ],
  },
});

console.log(templateResult.totalCount); // 3
// Each slot has its label and requirements pre-populated
```

## Error Handling

```typescript
import { PublishValidationError } from '../assignment/errors/publish-validation-error';
import { InvalidStateTransitionError } from '../assignment/errors/invalid-state-transition-error';
import { EmptyScheduleError } from '../assignment/errors/empty-schedule-error';
import { DuplicateSlotsError } from '../assignment/errors/duplicate-slots-error';

try {
  AssignmentManagerService.publish(request);
} catch (error) {
  if (error instanceof PublishValidationError) {
    // Stale hard constraint failures at publish time
    console.error(`${error.failures.length} assignments failed:`);
    error.failures.forEach((f) =>
      console.error(`  ${f.assignmentId}: ${f.reason} — ${f.message}`)
    );
  }
  if (error instanceof EmptyScheduleError) {
    console.error('No assignments to publish');
  }
  if (error instanceof InvalidStateTransitionError) {
    console.error(`Invalid: ${error.attemptedAction} on ${error.currentStatus}`);
  }
}
```

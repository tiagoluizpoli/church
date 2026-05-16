# Quickstart: Conflict & Validation Service

The Conflict & Validation Service is a pure Domain Service. Like the Availability Engine, it receives all data through function arguments — no database access, no side effects.

## Usage Example: Full Validation Pipeline

```typescript
import { AvailabilityEngine } from '../availability/availability-engine';
import { ConflictValidationService } from '../conflict/conflict-validation-service';
import type { ValidationRequest, OverrideRequest } from '../conflict/types';

// 1. Run the Availability Engine (Spec L1) first
const availabilityResult = AvailabilityEngine.checkAvailability({
  churchId: 'chu_123',
  volunteerId: 'vol_456',
  timeRange: { start: new Date('2026-05-20T09:00:00Z'), end: new Date('2026-05-20T12:00:00Z') },
  existingBlockouts: /* fetched from repo */,
  existingAssignments: /* fetched from repo */,
});

// 2. Prepare the validation request
const validationRequest: ValidationRequest = {
  churchId: 'chu_123',
  volunteerId: 'vol_456',
  ministryId: 'min_789',
  roleId: 'role_abc',
  slotId: 'slot_def',
  eventStartTime: new Date('2026-05-20T09:00:00Z'),
  now: new Date(),  // injected clock
  availabilityResult,
  existingAssignmentIds: [],  // no existing assignment on this slot
  serviceCount: 3,            // volunteer has served 3 times this month
  fairnessThreshold: 5,       // ministry allows max 5 per month
  volunteerQualifiedRoleIds: ['role_abc', 'role_xyz'],
  volunteerMinistryIds: ['min_789'],
};

// 3. Validate — this may throw HardConstraintError
const softResult = ConflictValidationService.validate(validationRequest);

// 4. Handle result
if (!softResult.hasConflicts) {
  // Safe to create assignment — no conflicts
  console.log('Assignment can proceed');
} else {
  // Soft conflicts detected — leader must decide
  console.log('Conflicts:', softResult.issues);

  // 5. Leader overrides
  const overrideRequest: OverrideRequest = {
    churchId: 'chu_123',
    assignmentId: 'assign_001',
    overrideReason: 'Ministry need — only qualified volunteer available',
    caller: { userId: 'leader_001', systemRole: 'leader', ministryId: 'min_789' },
    targetMinistryId: 'min_789',
  };

  const audit = ConflictValidationService.authorizeOverride(overrideRequest, softResult);
  // audit is an AssignmentAudit entity — caller must persist it
  console.log('Override authorized. Audit:', audit);
}
```

## Error Handling

```typescript
import { HardConstraintError } from '../conflict/errors';

try {
  ConflictValidationService.validate(request);
} catch (error) {
  if (error instanceof HardConstraintError) {
    console.error(`Blocked: ${error.reason} — ${error.message}`);
    // error.reason is one of: 'NOT_QUALIFIED', 'NOT_IN_MINISTRY', 'EVENT_IN_PAST', 'DUPLICATE_ASSIGNMENT'
  }
}
```

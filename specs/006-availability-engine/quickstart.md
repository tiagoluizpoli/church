# Quickstart: Availability Engine

The Availability Engine is a pure Domain Service. It does not fetch data from the database. You must provide the data to the engine.

## Usage Example

```typescript
import { AvailabilityEngine } from "@/api/domain/availability/AvailabilityEngine";
import { AvailabilityCheckRequest } from "@/api/domain/availability/types";

// 1. Fetch your data from the Repository layer (Drizzle)
const volunteerId = "vol_123";
const churchId = "chu_123";
const timeRange = {
  start: new Date("2026-05-20T09:00:00Z"),
  end: new Date("2026-05-20T12:00:00Z"),
};

// 2. Mocking DB fetch for existing blocks
const existingBlockouts = await blockoutRepository.findByVolunteerId(churchId, volunteerId);
const existingAssignments = await assignmentRepository.findByVolunteerId(churchId, volunteerId);

// 3. Prepare the request
const request: AvailabilityCheckRequest = {
  churchId,
  volunteerId,
  timeRange,
  excludeAssignmentId: "assign_789", // optional, if editing an existing shift
  existingBlockouts,
  existingAssignments,
};

// 4. Run the engine
const result = AvailabilityEngine.checkAvailability(request);

if (result.status === "AVAILABLE") {
  console.log("Volunteer is good to go!");
} else if (result.status === "DOUBLE_BOOKED") {
  console.log(`Conflict with assignment: ${result.conflictingId}`);
} else {
  console.log(`Conflict with blockout: ${result.conflictingId}`);
}
```

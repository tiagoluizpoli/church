# Data Model Mapping: Drizzle to Domain Entities (Spec R2)

This document outlines the mappings between Drizzle ORM database tables (from `@church/db`) and Clean Architecture Domain Entities (from `@church/server` domain layer).

## Entity Mappings

| Drizzle DB Schema Row | Domain Entity class | Primary Key | Scoping Key (`churchId`) |
|-----------------------|---------------------|-------------|--------------------------|
| `church` (from `schema/church.ts`) | `Church` | `ChurchId` | N/A (root tenant) |
| `ministry` (from `schema/core.ts`) | `Ministry` | `MinistryId` | `ChurchId` |
| `volunteer` (from `schema/core.ts`) | `Volunteer` | `VolunteerId` | `ChurchId` |
| `role` (from `schema/core.ts`) | `Role` | `RoleId` | `ChurchId` |
| `event` (from `schema/scheduling.ts`) | `Event` | `EventId` | `ChurchId` |
| `timeSlot` (from `schema/scheduling.ts`) | `TimeSlot` | `TimeSlotId` | `ChurchId` |
| `slotRequirement` (from `schema/scheduling.ts`) | `SlotRequirement` | `SlotRequirementId` | `ChurchId` |
| `assignment` (from `schema/assignments.ts`) | `Assignment` | `AssignmentId` | `ChurchId` |
| `availability` (from `schema/assignments.ts`) | `Availability` | `AvailabilityId` | `ChurchId` |
| `assignmentAudit` (from `schema/assignments.ts`) | `AssignmentAudit` | `AssignmentAuditId` | `ChurchId` |

---

## Detailed Mapping Schemas

### 1. Church
- **Source**: `schema/church.ts` -> `church` table
- **Target**: `domain/entities/church.ts` -> `Church` class
- **Fields**:
  - `id`: `string` -> cast to `ChurchId`
  - `name`: `string`
  - `slug`: `string` -> cast to `ChurchSlug`
  - `createdAt`: `Date`
  - `updatedAt`: `Date`

### 2. Ministry
- **Source**: `schema/core.ts` -> `ministry` table
- **Target**: `domain/entities/ministry.ts` -> `Ministry` class
- **Fields**:
  - `id`: `string` -> cast to `MinistryId`
  - `churchId`: `string` -> cast to `ChurchId`
  - `name`: `string`
  - `description`: `string | null`
  - `enforcementType`: `'soft' | 'hard'` -> mapped strictly with validation
  - `deletedAt`: `Date | null` (soft-deleted filtering)

### 3. Volunteer
- **Source**: `schema/core.ts` -> `volunteer` table
- **Target**: `domain/entities/volunteer.ts` -> `Volunteer` class
- **Fields**:
  - `id`: `string` -> cast to `VolunteerId`
  - `userId`: `string` -> cast to `UserId`
  - `churchId`: `string` -> cast to `ChurchId`
  - `status`: `'active' | 'inactive' | 'on_hold'` -> mapped strictly with validation
  - `notes`: `string | null`

### 4. Role
- **Source**: `schema/core.ts` -> `role` table
- **Target**: `domain/entities/role.ts` -> `Role` class
- **Fields**:
  - `id`: `string` -> cast to `RoleId`
  - `churchId`: `string` -> cast to `ChurchId`
  - `ministryId`: `string | null` -> cast to `MinistryId | null`
  - `name`: `string`
  - `isGlobal`: `boolean`

### 5. Event
- **Source**: `schema/scheduling.ts` -> `event` table
- **Target**: `domain/entities/event.ts` -> `Event` class
- **Fields**:
  - `id`: `string` -> cast to `EventId`
  - `churchId`: `string` -> cast to `ChurchId`
  - `ministryId`: `string` -> cast to `MinistryId`
  - `title`: `string`
  - `description`: `string | null`
  - `location`: `string | null`
  - `startDate`: `Date` (UTC)
  - `endDate`: `Date` (UTC)
  - `status`: `'draft' | 'published' | 'cancelled'` -> mapped strictly with validation

### 6. TimeSlot
- **Source**: `schema/scheduling.ts` -> `time_slot` table
- **Target**: `domain/entities/time-slot.ts` -> `TimeSlot` class
- **Fields**:
  - `id`: `string` -> cast to `TimeSlotId`
  - `churchId`: `string` -> cast to `ChurchId`
  - `eventId`: `string` -> cast to `EventId`
  - `startTime`: `Date` (UTC)
  - `endTime`: `Date` (UTC)
  - `label`: `string | null`

### 7. SlotRequirement
- **Source**: `schema/scheduling.ts` -> `slot_requirement` table
- **Target**: `domain/entities/slot-requirement.ts` -> `SlotRequirement` class
- **Fields**:
  - `id`: `string` -> cast to `SlotRequirementId`
  - `churchId`: `string` -> cast to `ChurchId`
  - `slotId`: `string` -> cast to `TimeSlotId`
  - `roleId`: `string` -> cast to `RoleId`
  - `teamId`: `string | null` -> cast to `TeamId | null`
  - `requiredCount`: `number`
  - `notes`: `string | null`

### 8. Assignment
- **Source**: `schema/assignments.ts` -> `assignment` table
- **Target**: `domain/entities/assignment.ts` -> `Assignment` class
- **Fields**:
  - `id`: `string` -> cast to `AssignmentId`
  - `churchId`: `string` -> cast to `ChurchId`
  - `slotId`: `string` -> cast to `TimeSlotId`
  - `volunteerId`: `string` -> cast to `VolunteerId`
  - `roleId`: `string` -> cast to `RoleId`
  - `status`: `'pending' | 'confirmed' | 'declined'` -> mapped strictly with validation
  - `reason`: `string | null`
  - `assignedAt`: `Date`
  - `assignedBy`: `string | null` -> cast to `UserId | null`

### 9. Availability
- **Source**: `schema/assignments.ts` -> `availability` table
- **Target**: `domain/entities/availability.ts` -> `Availability` class
- **Fields**:
  - `id`: `string` -> cast to `AvailabilityId`
  - `churchId`: `string` -> cast to `ChurchId`
  - `volunteerId`: `string` -> cast to `VolunteerId`
  - `type`: `'available' | 'unavailable'` -> mapped strictly with validation
  - `startTime`: `Date` (UTC)
  - `endTime`: `Date` (UTC)
  - `isAllDay`: `boolean`
  - `reason`: `string | null`
  - `repeatRule`: `string | null`

### 10. AssignmentAudit
- **Source**: `schema/assignments.ts` -> `assignment_audit` table
- **Target**: `domain/entities/assignment-audit.ts` -> `AssignmentAudit` class
- **Fields**:
  - `id`: `string` -> cast to `AssignmentAuditId`
  - `churchId`: `string` -> cast to `ChurchId`
  - `assignmentId`: `string` -> cast to `AssignmentId`
  - `actorId`: `string` -> cast to `UserId`
  - `action`: `'created' | 'updated' | 'deleted' | 'status_change'` -> mapped strictly with validation
  - `reason`: `string | null`
  - `timestamp`: `Date`

# Data Model: Schedule Builder (Desktop)

**Branch**: `013-schedule-builder` | **Date**: 2026-06-26

---

## Existing Entities (No Changes Needed)

These tables are fully implemented and require no modification for this feature:

| Table | Location | Notes |
|-------|----------|-------|
| `event` | `packages/db/src/schema/scheduling.ts` | Needs `event_type` column addition — see below |
| `time_slot` | `packages/db/src/schema/scheduling.ts` | `label` column already exists ✅ |
| `slot_requirement` | `packages/db/src/schema/scheduling.ts` | `requiredCount` + `teamId` scoping ✅ |
| `assignment` | `packages/db/src/schema/assignments.ts` | `status` enum: draft/pending/confirmed/declined/cancelled ✅ |
| `assignment_audit` | `packages/db/src/schema/assignments.ts` | `action` enum: created/status_change ✅ |
| `availability` | `packages/db/src/schema/assignments.ts` | Blockout ranges ✅ |

---

## Schema Modifications

### 1. `event` table — add `event_type` column

**File**: `packages/db/src/schema/scheduling.ts`

```typescript
// Add to enums.ts:
export const eventTypeEnum = pgEnum('event_type', ['hourly', 'day_based']);

// Add column to event table:
eventType: eventTypeEnum('event_type').default('hourly').notNull(),
```

**Migration**: Additive — existing rows default to `'hourly'`. No data migration needed.

**Domain entity update** (`apps/server/src/domain/entities/event.ts`):
```typescript
export type EventType = 'hourly' | 'day_based';
// Add to Event interface:
eventType: EventType;
```

**Repository mapper update** (`DrizzleEventRepository`): Add `eventType` to `mapEvent`.

---

## New Entities

### 2. `role_template` table

Stores named sets of role requirements for a ministry, applied during slot generation.

**File**: `packages/db/src/schema/role-templates.ts` *(new file)*

```typescript
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { church } from './church';
import { ministry } from './core';

export const roleTemplate = pgTable('role_template', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id')
    .notNull()
    .references(() => church.id, { onDelete: 'cascade' }),
  ministryId: uuid('ministry_id')
    .notNull()
    .references(() => ministry.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
```

### 3. `role_template_item` table

One row per role + count pair within a template.

```typescript
import { integer, pgTable, uuid } from 'drizzle-orm/pg-core';
import { church } from './church';
import { role } from './core';
import { roleTemplate } from './role-templates';

export const roleTemplateItem = pgTable('role_template_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  churchId: uuid('church_id')
    .notNull()
    .references(() => church.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id')
    .notNull()
    .references(() => roleTemplate.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id')
    .notNull()
    .references(() => role.id, { onDelete: 'cascade' }),
  requiredCount: integer('required_count').default(1).notNull(),
});
```

---

## Domain Entities (TypeScript Interfaces)

**File**: `apps/server/src/domain/entities/role-template.ts` *(new file)*

```typescript
import type { Brand } from '@church/core';
import type { ChurchId } from './church';
import type { MinistryId } from './ministry';
import type { RoleId } from './role';

export type RoleTemplateId = Brand<string, 'RoleTemplateId'>;
export type RoleTemplateItemId = Brand<string, 'RoleTemplateItemId'>;

export interface RoleTemplateItem {
  id: RoleTemplateItemId;
  churchId: ChurchId;
  templateId: RoleTemplateId;
  roleId: RoleId;
  requiredCount: number;
}

export interface RoleTemplate {
  id: RoleTemplateId;
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
  items: RoleTemplateItem[];
}
```

---

## Repository Contracts (New/Extended)

### Extended: `TimeSlotRepository`

Add to existing interface (`apps/server/src/domain/repositories/time-slot.repository.ts`):

```typescript
// Single slot create (complement to bulkCreate)
create(
  churchId: ChurchId,
  input: CreateTimeSlotInput,
  tx?: TransactionContext
): Promise<TimeSlot>;

// Update slot time/label
update(
  churchId: ChurchId,
  id: TimeSlotId,
  input: UpdateTimeSlotInput,
  tx?: TransactionContext
): Promise<TimeSlot>;

// Delete single slot by ID (errors if active assignments exist)
deleteById(
  churchId: ChurchId,
  id: TimeSlotId,
  tx?: TransactionContext
): Promise<void>;

// Check overlap with existing slots in same event
findOverlapping(
  churchId: ChurchId,
  eventId: EventId,
  startTime: Date,
  endTime: Date,
  excludeSlotId?: TimeSlotId
): Promise<TimeSlot[]>;

interface CreateTimeSlotInput {
  eventId: EventId;
  startTime: Date;
  endTime: Date;
  label?: string;
}

interface UpdateTimeSlotInput {
  startTime?: Date;
  endTime?: Date;
  label?: string;
}
```

### Extended: `EventRepository`

Add to existing interface:

```typescript
// List events for a ministry (used by event list page)
listByMinistry(
  churchId: ChurchId,
  ministryId: MinistryId,
  tx?: TransactionContext
): Promise<Event[]>;

// Update event metadata (title, dates, eventType)
update(
  churchId: ChurchId,
  id: EventId,
  input: UpdateEventInput,
  tx?: TransactionContext
): Promise<Event>;

interface CreateEventInput {
  ministryId: MinistryId;
  title: string;
  startDate: Date;
  endDate: Date;
  eventType: EventType;
}

interface UpdateEventInput {
  title?: string;
  startDate?: Date;
  endDate?: Date;
}
```

### Extended: `AssignmentAuditRepository`

Add to existing interface:

```typescript
// List all audits for all assignments in an event
listByEvent(
  churchId: ChurchId,
  eventId: EventId,
  tx?: TransactionContext
): Promise<AssignmentAuditEntry[]>;
```

### New: `RoleTemplateRepository`

**File**: `apps/server/src/domain/repositories/role-template.repository.ts`

```typescript
export interface RoleTemplateRepository {
  listByMinistry(churchId: ChurchId, ministryId: MinistryId): Promise<RoleTemplate[]>;
  getById(churchId: ChurchId, id: RoleTemplateId): Promise<RoleTemplate>;
  create(churchId: ChurchId, input: CreateRoleTemplateInput, tx?: TransactionContext): Promise<RoleTemplate>;
  update(churchId: ChurchId, id: RoleTemplateId, input: UpdateRoleTemplateInput, tx?: TransactionContext): Promise<RoleTemplate>;
  deleteById(churchId: ChurchId, id: RoleTemplateId, tx?: TransactionContext): Promise<void>;
}

interface CreateRoleTemplateInput {
  ministryId: MinistryId;
  name: string;
  items: Array<{ roleId: RoleId; requiredCount: number }>;
}

interface UpdateRoleTemplateInput {
  name?: string;
  items?: Array<{ roleId: RoleId; requiredCount: number }>;
}
```

---

## Validation Rules

| Rule | Enforcement Layer |
|------|------------------|
| `startTime < endTime` on slot | DB check constraint + Zod schema on procedure input |
| No overlapping slots in same event | Application layer (`findOverlapping` before create/update) |
| `requiredCount >= 1` on slot_requirement | DB check constraint (already exists) |
| `requiredCount >= 1` on role_template_item | Application layer Zod validation |
| Assignment per slot limited to `requiredCount` | Soft warning via conflict detection (not a hard DB constraint for MVP) |
| Cannot delete slot with active (pending/confirmed) assignments | Application layer check in `deleteSlot` procedure |
| Cannot add/remove slots on Published event | Application layer check in `createSlot`/`deleteSlot` procedures |
| Override reason minimum 10 chars | Zod `.min(10)` on `overrideReason` in `createAssignment` input |

---

## State Transitions

### Event Status
```
draft ──publish──→ published
draft ──cancel──→ cancelled
published ──(assignment edits only)──→ published  (no status change needed)
```
*Note: returning to draft from published is out of scope for MVP.*

### Assignment Status
```
draft ──publish event──→ pending
pending ──volunteer confirms──→ confirmed
pending ──volunteer declines──→ declined
pending/confirmed ──leader removes──→ cancelled
draft ──leader removes──→ (deleted from DB)
```

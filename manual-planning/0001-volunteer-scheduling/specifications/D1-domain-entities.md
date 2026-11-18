# Spec D1: Domain Entities

## Purpose
Define the **Core Domain Entities** for the Church Volunteer Scheduling Platform. These entities are pure TypeScript objects that represent the business logic and rules, serving as the "Single Source of Truth" across all layers (Domain, Application, Infrastructure).

## Core Entity Pattern

To ensure consistency and enforce DDD principles, all domain entities must extend the `Entity` base class. We strictly follow the **"Object-Only Properties"** rule: all parameters passed to constructors or functions MUST be wrapped in a single object.

### 1. Entity Base Class
```typescript
export interface EntityConstructorArgs<T> {
  props: T;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export abstract class Entity<T> {
  protected readonly _id: string;
  protected readonly _props: T;
  protected readonly _createdAt: Date;
  protected _updatedAt: Date;

  constructor(args: EntityConstructorArgs<T>) {
    this._id = args.id ?? crypto.randomUUID();
    this._props = args.props;
    this._createdAt = args.createdAt ?? new Date();
    this._updatedAt = args.updatedAt ?? new Date();
  }

  get id(): string {
    return this._id;
  }

  get props(): T {
    return this._props;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Entities are compared by their IDs (GUIDs).
   */
  public equals(other?: Entity<T>): boolean {
    if (other === null || other === undefined) return false;
    if (this === other) return true;
    return this._id === other._id;
  }
}
```

## Domain Entities

### 1. Church
```typescript
interface ChurchProps {
  name: string;
  slug: string;
  settings: {
    timezone: string;
    softEnforcement: boolean;
  };
}

class Church extends Entity<ChurchProps> {}
```

### 2. Ministry
```typescript
interface MinistryProps {
  churchId: string;
  name: string;
  description?: string;
  deletedAt?: Date;
}

class Ministry extends Entity<MinistryProps> {}
```

### 3. Role
```typescript
interface RoleProps {
  churchId: string;
  ministryId?: string;
  name: string;
  description?: string;
}

class Role extends Entity<RoleProps> {}
```

### 4. Volunteer
```typescript
interface VolunteerProps {
  churchId: string;
  userId: string;
  roles: string[];
}

class Volunteer extends Entity<VolunteerProps> {}
```

### 5. Event
```typescript
interface EventProps {
  churchId: string;
  ministryId: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  status: 'draft' | 'published' | 'cancelled';
}

class Event extends Entity<EventProps> {}
```

**Refined (017, 2026-07-02):** Drop `ministryId` (Events are Church-owned) and add `planningCycleId: string`. The `status` enum becomes `'draft' | 'scheduled' | 'cancelled' | 'past'` — "published" leaves the Event (publishing is per `MinistryParticipation`). (see ADR 0001 / CONTEXT.md)

### 6. TimeSlot
```typescript
interface TimeSlotProps {
  churchId: string;
  eventId: string;
  startTime: Date;
  endTime: Date;
  label?: string;
}

class TimeSlot extends Entity<TimeSlotProps> {}
```

**Refined (017, 2026-07-02):** `TimeSlot` is now church-level (shared, opt-in/out). A new **`Shift`** entity is the per-ministry subdivision (`{ timeSlotId, participationId, startTime, endTime }`), living inside a `MinistryParticipation`, and must lie entirely within its parent TimeSlot. Default = one `Shift` = the whole `TimeSlot`. Generated slots also record `sourceTemplateBlockId`. (see ADR 0002 / CONTEXT.md)

### 7. SlotRequirement
```typescript
interface SlotRequirementProps {
  churchId: string;
  slotId: string;
  roleId: string;
  count: number;
}

class SlotRequirement extends Entity<SlotRequirementProps> {}
```

**Refined (017, 2026-07-02):** Re-key from `slotId` to **`shiftId`** and add `participationId` (owning `MinistryParticipation`). (see ADR 0002 / CONTEXT.md)

### 8. Assignment
```typescript
interface AssignmentProps {
  churchId: string;
  slotId: string;
  volunteerId: string;
  roleId: string;
  status: 'pending' | 'confirmed' | 'declined';
  assignedBy: string;
}

class Assignment extends Entity<AssignmentProps> {}
```

**Refined (017, 2026-07-02):** Re-key from `slotId` to **`shiftId`** and add `participationId` (owning `MinistryParticipation`, resolving BL-006 team attribution natively). (see ADR 0001 / ADR 0002 / CONTEXT.md)

### 9. AssignmentAudit
```typescript
interface AssignmentAuditProps {
  assignmentId: string;
  churchId: string;
  userId: string;
  action: 'created' | 'updated' | 'deleted' | 'status_change';
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
}

class AssignmentAudit extends Entity<AssignmentAuditProps> {}
```

### 10. Availability
```typescript
interface AvailabilityProps {
  churchId: string;
  volunteerId: string;
  startTime: Date;
  endTime: Date;
  status: 'available' | 'unavailable';
  note?: string;
}

class Availability extends Entity<AvailabilityProps> {}
```

**Refined (017, 2026-07-02):** Reshape to a per-**`Shift`** **unavailability** mark (default-available) hung off an `AvailabilityCheck`. Replace the free-span `startTime`/`endTime`/`status` shape with `{ availabilityCheckId, shiftId }` (a mark = "unavailable for this Shift"). See the new `AvailabilityCheck` entity below. (see ADR 0002 / CONTEXT.md)

### 11. New 017 Entities

**Refined (017, 2026-07-02):** The reshape introduces the following new domain entities (see `CONTEXT.md` for full definitions and ADR 0001 / ADR 0002 for the decisions). No `RoleTemplate` entity exists — it is removed for MVP (BL-009); recurring counts come from `MinistryServingProfile`.

- **`PlanningCycle`** — church-scoped `{ churchId, startDate, endDate, status: 'draft' | 'locked' | 'archived' }`; non-overlapping date ranges, dates-only boundaries.
- **`EventTemplate`** — ChurchAdmin blueprint `{ churchId, weekday, timeBlocks: TimeBlock[] }` for recurring single-day gatherings.
- **`TimeBlock`** — `{ id, label, startTime, endTime }` inside an EventTemplate; its id is copied to a generated slot as `sourceTemplateBlockId`.
- **`MinistryServingProfile`** — per-ministry standing rule bound to templates by `sourceTemplateBlockId`; seeds inclusions + Shifts + requirements.
- **`MinistryParticipation`** — one per `(ministryId, eventId)`; holds inclusions, requirements, and lifecycle `'tailoring' | 'availability_fired' | 'rostering' | 'published'`.
- **`Shift`** — `{ timeSlotId, participationId, startTime, endTime }`; per-ministry subdivision of a TimeSlot, bounded within it.
- **`AvailabilityCheck`** — one per `(planningCycleId, membership)`; `status: 'pending' | 'confirmed'` with `confirmedAt`.
- **`Ministry`** also gains `defaultDirection: 'all_in' | 'all_out'` (participation default; not a template concept).

## Layer Responsibilities

### Domain Layer
- Owns these entity definitions.
- Defines **Domain Services** that operate on these entities (e.g., Availability Engine).

### Infrastructure Layer (Repositories)
- Responsible for mapping **Drizzle Models** (Spec S1) to **Domain Entities** (Spec D1).
- Repositories MUST return Domain Entities to the Application layer.

### Application Layer
- Uses Domain Entities to implement Use Cases.
- Never interacts directly with database models.

## Alignment & Constraints
- **Timezone**: All `Date` objects in entities are UTC.
- **Isolation**: Every entity (except `Church` itself) MUST include `churchId` for multi-tenant isolation.
- **Immutability**: Entities should ideally be treated as immutable in the domain logic. Changes are handled via the `props` object, often resulting in new entity instances or audit logs.

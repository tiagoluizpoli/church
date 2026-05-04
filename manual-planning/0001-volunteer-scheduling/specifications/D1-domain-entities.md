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

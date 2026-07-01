# Data Model: Monorepo Architecture Reshape

**Phase**: 1 | **Feature**: [plan.md](plan.md) | **Date**: 2026-07-01

No new database schema changes. This file documents the key TypeScript interfaces and patterns introduced by the architecture migration.

---

## Core Abstractions (packages/core)

### DomainError — updated

```typescript
// packages/core/src/domain-error.ts
export abstract class DomainError extends Error {
  abstract readonly code: string;  // NEW — required in every subclass
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}
```

All existing `DomainError` subclasses in `apps/server/src/domain/errors/` and `domain/assignment/errors/` and `domain/conflict/errors/` must add `readonly code = 'SPECIFIC_CODE' as const`.

### BrandedId — unchanged

```typescript
// packages/core/src/branded-id.ts (stays as-is)
declare const __brand: unique symbol;
export type BrandedId<Brand extends string> = string & {
  readonly [__brand]: Brand;
};
```

---

## Domain — New Patterns

### Branded ID pattern (domain/branded-ids/)

```typescript
// domain/branded-ids/event-id.ts
import type { BrandedId } from '@church/core';

export type EventId = BrandedId<'EventId'>;
export namespace EventId {
  export function from(raw: string): EventId {
    return raw as EventId;
  }
}
```

Same pattern for: `ChurchId`, `MinistryId`, `VolunteerId`, `AssignmentId`, `TimeSlotId`, `RoleId`, `TeamId`, `AvailabilityId`, `NotificationId`.

### Value Object pattern (domain/value-objects/)

```typescript
// domain/value-objects/date-range.ts (first VO target)
import { DomainError } from '@church/core';

class InvalidDateRangeError extends DomainError {
  readonly code = 'INVALID_DATE_RANGE' as const;
  constructor() { super('End date must be after start date'); }
}

export class DateRange {
  private constructor(
    readonly start: Date,
    readonly end: Date,
  ) {}

  static create(start: Date, end: Date): DateRange {
    if (end <= start) throw new InvalidDateRangeError();
    return new DateRange(start, end);
  }

  contains(date: Date): boolean {
    return date >= this.start && date <= this.end;
  }

  overlaps(other: DateRange): boolean {
    return this.start < other.end && this.end > other.start;
  }
}
```

---

## API Layer (api/)

### FastifyController — new abstract base

```typescript
// api/contracts/fastify-controller.ts
import type { FastifyPluginOptions } from 'fastify';
import type { FastifyTypedInstance } from '@/main/fastify/types';

export abstract class FastifyController {
  abstract readonly prefix: string;
  abstract registerRoutes(app: FastifyTypedInstance, opts: FastifyPluginOptions): void;
}
```

### FastifyTypedInstance — type alias

```typescript
// main/fastify/types.ts
import type {
  FastifyBaseLogger, FastifyInstance,
  RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault,
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export type FastifyTypedInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;
```

### DTO pattern (api/dtos/)

```typescript
// api/dtos/event.dto.ts — example structure
import { z } from 'zod';
import type { Event } from '@/domain/entities/event';

export const createEventBodySchema = z.object({ ... });
export const eventResponseSchema = z.object({ ... });

export type CreateEventBody = z.infer<typeof createEventBodySchema>;
export type EventResponse = z.infer<typeof eventResponseSchema>;

export const eventMapper = {
  toResponse(event: Event): EventResponse { ... },
  toResponseList(events: Event[]): EventResponse[] { ... },
};
```

---

## Domain Layer — Use-Case Contracts (domain/contracts/)

Manager interfaces live in `domain/contracts/` — domain owns "what the system CAN DO".

### IEventManager

```typescript
// domain/contracts/event-manager.ts
export interface IEventManager {
  getScheduleBuilderData(input: { churchId: ChurchId; ministryId: MinistryId }): Promise<ScheduleBuilderData>;
  createEvent(input: CreateEventInput): Promise<Event>;
  listEvents(input: ListEventsInput): Promise<Event[]>;
  publishEvent(input: { eventId: EventId; churchId: ChurchId }): Promise<void>;
  cancelEvent(input: { eventId: EventId; churchId: ChurchId }): Promise<void>;
  createSlot(input: CreateSlotInput): Promise<TimeSlot>;
  updateSlot(input: UpdateSlotInput): Promise<TimeSlot>;
  deleteSlot(input: { slotId: TimeSlotId; eventId: EventId }): Promise<void>;
  generateSlots(input: GenerateSlotsInput): Promise<TimeSlot[]>;
  upsertSlotRequirement(input: UpsertSlotRequirementInput): Promise<SlotRequirement>;
  sendReminder(input: { eventId: EventId; churchId: ChurchId }): Promise<void>;
}
```

### IVolunteerManager

```typescript
// domain/contracts/volunteer-manager.ts
export interface IVolunteerManager {
  getDashboard(input: { volunteerId: VolunteerId; churchId: ChurchId }): Promise<VolunteerDashboard>;
  getUpcomingAssignments(input: { volunteerId: VolunteerId }): Promise<Assignment[]>;
  getMinistrySchedule(input: { ministryId: MinistryId; volunteerId: VolunteerId }): Promise<MinistrySchedule>;
  upsertAvailability(input: UpsertAvailabilityInput): Promise<Availability>;
  deleteAvailability(input: { availabilityId: AvailabilityId; volunteerId: VolunteerId }): Promise<void>;
  getAvailability(input: { volunteerId: VolunteerId; churchId: ChurchId }): Promise<Availability[]>;
  respondToAssignment(input: RespondToAssignmentInput): Promise<Assignment>;
  getNotifications(input: { volunteerId: VolunteerId }): Promise<VolunteerNotification[]>;
  markNotificationRead(input: { notificationId: NotificationId; volunteerId: VolunteerId }): Promise<void>;
  markAllNotificationsRead(input: { volunteerId: VolunteerId }): Promise<void>;
}
```

### IAssignmentManager

```typescript
// domain/contracts/assignment-manager.ts
export interface IAssignmentManager {
  createAssignment(input: CreateAssignmentInput): Promise<Assignment>;
  deleteAssignment(input: { assignmentId: AssignmentId; churchId: ChurchId }): Promise<void>;
  listAuditLog(input: { assignmentId: AssignmentId }): Promise<AssignmentAudit[]>;
}
```

### IMinistryManager

```typescript
// domain/contracts/ministry-manager.ts
export interface IMinistryManager {
  listByLeader(input: { leaderId: VolunteerId; churchId: ChurchId }): Promise<Ministry[]>;
}
```

### IRoleManager

```typescript
// domain/contracts/role-manager.ts
export interface IRoleManager {
  listTemplates(input: { churchId: ChurchId }): Promise<RoleTemplate[]>;
  upsertTemplate(input: UpsertRoleTemplateInput): Promise<RoleTemplate>;
  applyTemplate(input: { eventId: EventId; templateId: string; churchId: ChurchId }): Promise<void>;
  deleteTemplate(input: { templateId: string; churchId: ChurchId }): Promise<void>;
}
```

### IFeatureFlagService

```typescript
// application/contracts/feature-flag-service.ts
export interface IFeatureFlagService {
  isEnabled(flagName: string, context?: FeatureFlagContext): boolean;
  getAll(context?: FeatureFlagContext): Record<string, boolean>;
}

export interface FeatureFlagContext {
  churchId?: string;
  userId?: string;
}
```

---

## Application Layer — Infrastructure Contracts (application/contracts/)

These interfaces live in `application/contracts/` — application defines "what it NEEDS FROM infrastructure". Moved from `domain/repositories/` and `domain/services/`.

### IUnitOfWork

```typescript
// application/contracts/unit-of-work.ts  (MOVED from domain/repositories/unit-of-work.ts)
export interface IUnitOfWork {
  run<T>(fn: (tx: ITransactionContext) => Promise<T>): Promise<T>;
}

// application/contracts/transaction-context.ts  (MOVED from domain/repositories/transaction-context.ts)
export interface ITransactionContext { /* drizzle tx handle */ }
```

### IEventRepository (example — all repo interfaces follow same pattern)

```typescript
// application/contracts/event.repository.ts  (MOVED from domain/repositories/event.repository.ts)
export interface IEventRepository {
  findById(id: EventId, tx?: ITransactionContext): Promise<Event | null>;
  findByMinistry(ministryId: MinistryId, tx?: ITransactionContext): Promise<Event[]>;
  save(event: Event, tx?: ITransactionContext): Promise<Event>;
  delete(id: EventId, tx?: ITransactionContext): Promise<void>;
}
```

All other repo interfaces (`IAssignmentRepository`, `IVolunteerRepository`, etc.) follow the same pattern and move to `application/contracts/`.

### INotificationService

```typescript
// application/contracts/notification-service.ts  (MOVED from domain/services/notification-service.ts)
export interface INotificationService {
  send(notification: VolunteerNotification): Promise<void>;
}
```

---

## Infrastructure Layer

### DrizzleUnitOfWork — moves to implement application/contracts/

```typescript
// infrastructure/repositories/drizzle-unit-of-work.ts — import path changes
import type { IUnitOfWork } from '@/application/contracts/unit-of-work';

@injectable()
export class DrizzleUnitOfWork implements IUnitOfWork { ... }
```

### Manager implementation pattern

```typescript
// application/db-event-manager.ts
import type { IEventManager } from '@/domain/contracts/event-manager';         // use-case interface from domain
import type { IEventRepository } from '@/application/contracts/event.repository'; // infra contract from application
import type { IUnitOfWork } from '@/application/contracts/unit-of-work';

@injectable()
export class DbEventManager implements IEventManager {
  constructor(
    @inject(tokens.eventRepository) private readonly events: IEventRepository,
    @inject(tokens.timeSlotRepository) private readonly slots: ITimeSlotRepository,
    @inject(tokens.unitOfWork) private readonly uow: IUnitOfWork,
    @inject(tokens.notificationService) private readonly notifications: INotificationService,
  ) {}

  async createEvent(input: CreateEventInput): Promise<Event> {
    // validation via domain services / VOs
    // uow.run() for multi-step writes
    // return domain entity
  }
}
```

---

## DI Injection Tokens

```typescript
// main/di/injection-tokens.ts
export const injection = {
  infra: {
    eventRepository: 'IEventRepository',
    volunteerRepository: 'IVolunteerRepository',
    assignmentRepository: 'IAssignmentRepository',
    assignmentAuditRepository: 'IAssignmentAuditRepository',
    availabilityRepository: 'IAvailabilityRepository',
    churchRepository: 'IChurchRepository',
    ministryRepository: 'IMinistryRepository',
    roleRepository: 'IRoleRepository',
    roleTemplateRepository: 'IRoleTemplateRepository',
    teamRepository: 'ITeamRepository',
    timeSlotRepository: 'ITimeSlotRepository',
    volunteerNotificationRepository: 'IVolunteerNotificationRepository',
    unitOfWork: 'IUnitOfWork',
    notificationService: 'INotificationService',
    featureFlagService: 'IFeatureFlagService',
  },
  managers: {
    eventManager: 'IEventManager',
    volunteerManager: 'IVolunteerManager',
    assignmentManager: 'IAssignmentManager',
    churchManager: 'IChurchManager',
    ministryManager: 'IMinistryManager',
    roleManager: 'IRoleManager',
  },
  controllers: {
    fastify: 'FastifyController',
  },
} as const;
```

---

## Error Code Registry

All domain error codes and their HTTP mappings (registered in `main/fastify/setup.ts`):

| Error Code | HTTP Status | Scenario |
|---|---|---|
| `INVALID_DATE_RANGE` | 400 | DateRange VO violation |
| `INVALID_REQUIRED_COUNT` | 400 | SlotRequirement count |
| `ISOLATION_BREACH` | 409 | Concurrent modification |
| `DUPLICATE_SLOTS` | 409 | Slot overlap |
| `EMPTY_SCHEDULE` | 422 | Publish with no slots |
| `INVALID_EVENT_DURATION` | 400 | Duration constraint |
| `INVALID_SLOT_DURATION` | 400 | Slot duration constraint |
| `INVALID_STATE_TRANSITION` | 409 | Event state machine |
| `PAST_EVENT` | 422 | Modifying past event |
| `PUBLISH_VALIDATION` | 422 | Publish preconditions |
| `HARD_CONSTRAINT_VIOLATION` | 409 | Assignment conflict |
| `INVALID_OVERRIDE_REASON` | 400 | Conflict override |
| `UNAUTHORIZED_OVERRIDE` | 403 | Role-based conflict override |
| `NOT_FOUND` | 404 | Entity not found |
| *(unmapped)* | 500 | Unknown DomainError code — log + generic message |

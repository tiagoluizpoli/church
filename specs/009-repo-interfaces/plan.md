# Implementation Plan: Repository Interfaces (Spec R1)

**Feature**: Repository Interfaces
**Spec**: [spec.md](./spec.md)
**Created**: 2026-05-22
**Updated**: 2026-05-23 (post-grill decisions)

## Overview

Define TypeScript interfaces for all data access operations in the volunteer scheduling system. These interfaces serve as the abstraction layer between domain services (L1, L2, L3) and the database implementation (Spec R2), enabling testability via mocks and enforcing `churchId` isolation at the type level with branded IDs.

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Package**: `@church/core` — repository interfaces live alongside `Entity<T>` and `DomainError`
- **Testing**: Vitest
- **Dependencies**: None (pure TypeScript interfaces — no runtime dependencies)

## Project Structure

All new files go into `packages/core/src/`:

```
packages/core/src/
├── entity.ts                      # (existing) Entity<T> base class
├── domain-error.ts                # (existing) DomainError base class
├── not-found-error.ts             # (new) NotFoundError subclass
├── branded-id.ts                  # (new) BrandedId<T> generic utility
├── entities/
│   ├── index.ts                   # barrel export for all entity types
│   ├── shared.ts                  # UserId, TeamId (external entity IDs)
│   ├── church.ts                  # ChurchId + Church type
│   ├── ministry.ts                # MinistryId + Ministry + MinistrySettings types
│   ├── volunteer.ts               # VolunteerId + Volunteer type
│   ├── role.ts                    # RoleId + Role type
│   ├── event.ts                   # EventId + Event + EventWithSlots types
│   ├── time-slot.ts               # TimeSlotId + SlotRequirementId + TimeSlot + SlotRequirement
│   ├── assignment.ts              # AssignmentId + Assignment type
│   ├── availability.ts            # AvailabilityId + Availability type
│   └── assignment-audit.ts        # AssignmentAuditId + AssignmentAudit type
├── repositories/
│   ├── index.ts                   # barrel export
│   ├── transaction-context.ts     # TransactionContext type
│   ├── unit-of-work.ts            # UnitOfWork interface
│   ├── church.repository.ts       # ChurchRepository interface
│   ├── ministry.repository.ts     # MinistryRepository interface
│   ├── volunteer.repository.ts    # VolunteerRepository interface
│   ├── role.repository.ts         # RoleRepository interface
│   ├── event.repository.ts        # EventRepository interface
│   ├── time-slot.repository.ts    # TimeSlotRepository interface
│   ├── assignment.repository.ts   # AssignmentRepository interface
│   ├── availability.repository.ts # AvailabilityRepository interface
│   └── assignment-audit.repository.ts # AssignmentAuditRepository interface
└── index.ts                       # (updated) re-export all
```

## Design Decisions

### 1. Branded ID Types (Co-located with Entities)

`@church/core` provides a generic `BrandedId<T>` utility — the branding mechanism. Each entity file defines its own concrete branded ID, co-located with its domain type (same pattern as `Entity<T>` base class).

```typescript
// packages/core/src/branded-id.ts — generic utility
export type BrandedId<Brand extends string> = string & { readonly __brand: Brand };

// packages/core/src/entities/church.ts — co-located with entity
import { BrandedId } from '../branded-id';
export type ChurchId = BrandedId<'ChurchId'>;
export type Church = { id: ChurchId; name: string; slug: string; /* ... */ };

// packages/core/src/entities/volunteer.ts — co-located with entity
import { BrandedId } from '../branded-id';
export type VolunteerId = BrandedId<'VolunteerId'>;
export type Volunteer = { id: VolunteerId; /* ... */ };
```

External entity IDs (`UserId`, `TeamId`) that belong to domains outside scheduling live in `entities/shared.ts` until their owning domains define them.

### 2. Transaction Context + UnitOfWork Pattern

Two related types:

```typescript
// Opaque — concrete type defined in Spec R2 (Drizzle)
export type TransactionContext = unknown;

// Callback-based transaction orchestration
export interface UnitOfWork {
  run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
```

Domain services use `UnitOfWork.run()` to create a transaction, then pass the `tx` to repository mutation methods. This keeps domain services in control of orchestration without knowing about Drizzle.

### 3. Naming Convention: find* vs get*

All methods return `Promise<T>`:

- `find*` → `Promise<T | null>` (optional lookup, no error thrown)
- `get*` → `Promise<T>` (throws `NotFoundError` if missing)
- `list*` → `Promise<T[]>` (always returns array, never null)
- `count*` → `Promise<number>`
- `create*` → `Promise<T>` (returns the created entity)
- `update*` → `Promise<void>`
- `delete*` → `Promise<void>`

### 4. Domain Entity Types

Type aliases representing domain entity shapes. These are the single source of truth that transits between all layers. When D1 is implemented as concrete classes, those classes will satisfy these shapes.

Key composite types:
- **`EventWithSlots`**: Returned by `EventRepository.getWithSlots`. Contains event + fully-loaded time slots with nested slot requirements.
- **`MinistrySettings`**: Projection returned by `MinistryRepository.getSettings`. Currently contains `enforcementType`, designed to grow.
- **`TimeSlot`**: Includes `requirements: SlotRequirement[]` — no separate SlotRequirementRepository needed.

### 5. churchId as First Parameter

Every method (except `ChurchRepository.getById` and `ChurchRepository.getBySlug`) takes `churchId: ChurchId` as its first parameter. This is a compile-time guarantee of multi-tenant isolation using the branded ID type.

### 6. Repository-Level Data Lookups vs Business Logic

Methods like `hasMembershipInMinistry` and `hasRoleQualification` are **row-existence checks** (data lookups), not business logic. The naming uses `has*` to signal this distinction. Business rules (e.g., "is this volunteer eligible for scheduling?") live in domain services (L2).

## Implementation Order

1. `NotFoundError` class (dependency for `get*` methods)
2. `BrandedId<T>` generic utility (`branded-id.ts`)
3. Entity type aliases with co-located branded IDs (`entities/*.ts`)
4. `TransactionContext` type + `UnitOfWork` interface
5. Repository interfaces (parallelizable — one file each)
6. Barrel exports
7. Contract tests (verify interfaces compile, mocks satisfy them)

## Testing Strategy

- **Contract tests**: Verify that mock implementations satisfy every interface method
- **Compilation tests**: Verify that omitting `churchId` causes a type error
- **Branded ID tests**: Verify that swapping entity IDs causes a type error
- **Coverage tests**: Cross-reference L1/L2/L3 data access needs against interface methods
- **UnitOfWork tests**: Verify callback-based transaction pattern works with mocks

## Schema Dependencies (for S1/R2)

- **`volunteer_role` junction table**: Required for `hasRoleQualification`. Currently missing from schema.
- **`assignment_audit.leader_id` → `actor_id`**: Domain uses `actorId`; schema column rename needed.
- **`availability` soft delete**: Consider `deletedAt` column instead of hard delete.

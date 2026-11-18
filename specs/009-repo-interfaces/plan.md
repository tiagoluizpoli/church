# Implementation Plan: Repository Interfaces (Spec R1)

**Feature**: Repository Interfaces
**Spec**: [spec.md](./spec.md)
**Created**: 2026-05-22
**Updated**: 2026-05-23 (post-grill decisions)

## Overview

Define TypeScript interfaces for all data access operations in the volunteer scheduling system. These interfaces serve as the abstraction layer between domain services (L1, L2, L3) and the database implementation (Spec R2), enabling testability via mocks and enforcing `churchId` isolation at the type level with branded IDs.

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Package structure**: 
  - `@church/core` — holds the generic `BrandedId<T>` type helper and existing generic primitives.
  - `@church/db` — holds database schema definitions and connection configuration.
  - `apps/server` — holds domain entities, branded ID types, repository interfaces (`src/domain/repositories/`), and Drizzle repository implementations (`src/infrastructure/repositories/drizzle/`).
- **Testing**: Vitest

## Project Structure

### New & Updated Files in `packages/core/`:
```
packages/core/src/
├── index.ts                       # (updated) re-export branded-id
└── branded-id.ts                  # (new) BrandedId<T> generic utility
```

### New & Updated Files in `apps/server/`:
```
apps/server/src/
├── domain/
│   ├── entities/
│   │   ├── church.ts              # (updated) Export ChurchId branded type
│   │   ├── volunteer.ts           # (updated) Export VolunteerId branded type
│   │   # ... same for other entity files to integrate branded IDs
│   └── repositories/
│       ├── index.ts               # barrel export
│       ├── transaction-context.ts # TransactionContext opaque branded type
│       ├── unit-of-work.ts        # UnitOfWork interface
│       ├── church.repository.ts   # ChurchRepository interface
│       ├── ministry.repository.ts # MinistryRepository interface
│       ├── volunteer.repository.ts # VolunteerRepository interface
│       ├── role.repository.ts     # RoleRepository interface
│       ├── event.repository.ts        # EventRepository interface
│       ├── time-slot.repository.ts    # TimeSlotRepository interface
│       ├── assignment.repository.ts   # AssignmentRepository interface
│       ├── availability.repository.ts # AvailabilityRepository interface
│       └── assignment-audit.repository.ts # AssignmentAuditRepository interface
└── infrastructure/
    └── repositories/
        └── drizzle/
            ├── drizzle-unit-of-work.ts        # UnitOfWork implementation
            ├── drizzle-church.repository.ts   # ChurchRepository implementation
            # ... and other concrete repositories implementing interfaces
```

## Design Decisions

### 1. Branded ID Types (Co-located with Domain Entities)

`@church/core` provides a generic `BrandedId<T>` utility. Each domain entity file in `apps/server` defines its own concrete branded ID type, co-located with its domain class.

```typescript
// packages/core/src/branded-id.ts — generic utility
declare const __brand: unique symbol;
export type BrandedId<Brand extends string> = string & { readonly [__brand]: Brand };

// apps/server/src/domain/entities/church.ts — co-located with class
import { BrandedId } from '@church/core';
export type ChurchId = BrandedId<'ChurchId'>;

export class Church extends Entity<ChurchProps> { ... }
```

### 2. Transaction Context + UnitOfWork Pattern

Opaque branding prevents leakage of ORM concepts:

```typescript
// apps/server/src/domain/repositories/transaction-context.ts
declare const transactionContextBrand: unique symbol;
export type TransactionContext = { readonly [transactionContextBrand]: never };

// Callback-based transaction orchestration
export interface UnitOfWork {
  run<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>;
}
```

Domain services use `UnitOfWork.run()` to create a transaction, then pass the `tx` to repository mutation methods. Inside infrastructure implementations (Drizzle), `tx` is cast back to `PgTransaction`.

### 3. Naming Convention: find* vs get*

All methods return `Promise<T>`:

- `find*` → `Promise<T | null>` (optional lookup, no error thrown)
- `get*` → `Promise<T>` (throws `NotFoundError` if missing)
- `list*` → `Promise<T[]>` (always returns array, never null)
- `count*` → `Promise<number>`
- `create*` → `Promise<T>` (returns the created entity)
- `update*` → `Promise<void>`
- `delete*` → `Promise<void>`

### 4. Domain Entities Integration

We reuse the existing concrete domain classes under `apps/server/src/domain/entities/` rather than creating duplicate type aliases. Branded ID types are integrated directly into these classes.

Key composite types:
- **`EventWithSlots`**: Returned by `EventRepository.getWithSlots`. Contains event + fully-loaded time slots with nested slot requirements.
- **`MinistrySettings`**: Projection returned by `MinistryRepository.getSettings`.
- **`TimeSlot`**: Includes `requirements: SlotRequirement[]` — no separate SlotRequirementRepository needed.

### 5. churchId as First Parameter

Every method (except `ChurchRepository.getById` and `ChurchRepository.getBySlug`) takes `churchId: ChurchId` as its first parameter. This is a compile-time guarantee of multi-tenant isolation using the branded ID type.

### 6. Repository-Level Data Lookups vs Business Logic

Methods like `hasMembershipInMinistry` and `hasRoleQualification` are row-existence checks (data lookups), not business logic. Business rules live in domain services (L2).

## Implementation Order

1. `BrandedId<T>` generic utility in `@church/core`
2. Integrate branded IDs into existing classes in `apps/server/src/domain/entities/`
3. `TransactionContext` type + `UnitOfWork` interface in `apps/server/src/domain/repositories/`
4. Repository interfaces in `apps/server/src/domain/repositories/`
5. Contract tests (verify interfaces compile, mocks satisfy them)

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

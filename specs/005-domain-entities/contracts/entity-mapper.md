# Contract: EntityMapper Interface

## Purpose

Defines the mapping contract between Drizzle ORM schema rows and domain entities. This is the bridge between the persistence layer (`@church/db`) and the domain layer (`packages/api/src/domain/`).

## Location

`packages/api/src/domain/mapper.ts`

## Interface

```typescript
/**
 * Bidirectional mapper between a persistence schema row and a domain entity.
 *
 * @typeParam SchemaRow - The Drizzle `$inferSelect` type (what comes out of the DB)
 * @typeParam DomainEntity - The domain entity class instance
 * @typeParam InsertRow - The Drizzle `$inferInsert` type (what goes into the DB).
 *                        Defaults to Partial<SchemaRow> for flexibility.
 */
export interface EntityMapper<SchemaRow, DomainEntity, InsertRow = Partial<SchemaRow>> {
  /**
   * Converts a raw database row into a domain entity.
   * Called by repositories after SELECT queries.
   */
  toDomain(row: SchemaRow): DomainEntity;

  /**
   * Converts a domain entity back into a persistence-compatible object.
   * Called by repositories before INSERT/UPDATE queries.
   */
  toPersistence(entity: DomainEntity): InsertRow;
}
```

## Usage (by Spec R2 — Drizzle Implementations)

Concrete mapper implementations will live in the **infrastructure layer** (`packages/api/src/infrastructure/repositories/` or similar), NOT in the domain layer. The domain only defines the interface.

```typescript
// Example: packages/api/src/infrastructure/mappers/assignment-mapper.ts
import type { assignment } from '@church/db';
import { Assignment } from '../../domain/entities/assignment';
import type { EntityMapper } from '../../domain/mapper';

type AssignmentRow = typeof assignment.$inferSelect;
type AssignmentInsert = typeof assignment.$inferInsert;

export class AssignmentMapper implements EntityMapper<AssignmentRow, Assignment, AssignmentInsert> {
  toDomain(row: AssignmentRow): Assignment {
    return new Assignment({
      id: row.id,
      props: {
        churchId: row.churchId,
        slotId: row.slotId,
        volunteerId: row.volunteerId,
        roleId: row.roleId,
        status: row.status,
        reason: row.reason ?? undefined,
        assignedAt: row.assignedAt,
        assignedBy: row.assignedBy ?? undefined,
      },
    });
  }

  toPersistence(entity: Assignment): AssignmentInsert {
    return {
      id: entity.id,
      churchId: entity.churchId,
      slotId: entity.slotId,
      volunteerId: entity.volunteerId,
      roleId: entity.roleId,
      status: entity.status,
      reason: entity.reason ?? null,
      assignedAt: entity.assignedAt,
      assignedBy: entity.assignedBy ?? null,
    };
  }
}
```

## Notes

- The `EntityMapper` interface lives in the **domain layer** (zero dependencies).
- Concrete implementations live in the **infrastructure layer** (Spec R2), NOT in the domain folder.
- The `InsertRow` generic defaults to `Partial<SchemaRow>` but should be explicitly set to the Drizzle `$inferInsert` type in real implementations.

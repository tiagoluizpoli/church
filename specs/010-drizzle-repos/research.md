# Technical Research: Drizzle Repository Implementations (Spec R2)

## Research Findings & Architectural Decisions

### 1. Transaction Management Context Wrapping
- **Decision**: Define a concrete class `DrizzleTransactionContext` implementing the opaque `TransactionContext` brand:
  ```typescript
  import type { TransactionContext } from '../../domain/repositories/transaction-context';
  import type { PgTransaction } from 'drizzle-orm/pg-core';
  
  export class DrizzleTransactionContext implements TransactionContext {
    // Brand requirement
    readonly [Symbol.toStringTag] = 'DrizzleTransactionContext';
    
    constructor(public readonly tx: any) {} // PgTransaction type
  }
  ```
- **Rationale**: Keeps Drizzle-specific transaction client instances encapsulated inside the infrastructure layer. Domain logic only handles the opaque `TransactionContext` type.
- **Alternatives considered**: Passing Drizzle transaction clients directly (`tx as unknown as TransactionContext`), rejected due to loss of runtime type safety and potential for casting issues.

### 2. Multi-Tenant Scoping (`withChurchIsolation`)
- **Decision**: Define a stateless helper function:
  ```typescript
  import { eq } from 'drizzle-orm';
  
  export function withChurchIsolation<T extends { churchId: any }>(
    table: T,
    churchId: string
  ) {
    return eq(table.churchId, churchId);
  }
  ```
- **Rationale**: Keeps repository queries readable, composable, and avoids complex runtime proxies or base classes.
- **Alternatives considered**: Base class with implicit scoping wrapper, rejected because direct compose in Drizzle queries is more idiomatic and simpler.

### 3. Enum Mapping and Type Assertions
- **Decision**: Define strict check mappers. Throw a descriptive `DomainError` or `DatabaseMappingError` if a value retrieved from the database cannot be matched to the domain union type. Cast branded nominal IDs at compile time (`row.id as VolunteerId`) to avoid runtime wrapper objects.
- **Rationale**: Protects domain invariance. Compile-time casting for branded IDs maintains high performance while ensuring compiler-enforced safety.
- **Alternatives considered**: Class wrappers for IDs (too heavy); ignoring enum validation (unsafe).

### 4. Relational Data Fetching Strategy
- **Decision**: Use Drizzle Relational Queries API (`db.query`) for complex entity queries (like `TimeSlot` with requirements) and standard SQL joins (`db.select().leftJoin(...)`) for simpler ones.
- **Rationale**: Relational query API automatically structures and nests relational arrays, removing extensive boilerplate mapping code.
- **Alternatives considered**: Standard flat SQL Joins only, which would require custom reducers to group rows into nested slot/requirement lists.

### 5. Integration Test Isolation
- **Decision**: Execute integration tests against a Docker PostgreSQL container. Use a database truncation script (`TRUNCATE TABLE ... CASCADE;`) before/after each test run to guarantee cleanliness.
- **Rationale**: Truncating tables is extremely fast and ensures true test isolation.
- **Alternatives considered**: Transactional rollbacks, which don't test multi-connection or transaction commit behavior.

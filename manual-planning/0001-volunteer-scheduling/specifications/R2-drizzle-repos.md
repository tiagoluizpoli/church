# Spec R2: Drizzle Implementations

## Purpose
Define the concrete implementation of the Repository Interfaces using Drizzle ORM.

## 1. Implementation Rules
- **Implicit Isolation**: Every SQL query must include `.where(and(eq(table.churchId, churchId), ...))`.
- **Joins**: Use Drizzle's relational query API (`db.query.table.findFirst({ with: { ... } })`) where possible for readability.
- **Transactions**: Complex operations (like `createWithSlots`) must use `db.transaction()` to ensure atomicity.

## 2. Shared Utilities
- `withChurchIsolation(db: DbInstance, churchId: string)`: A helper to auto-inject the church filter into queries.

## 3. Error Handling
- Throw `DomainError` (e.g., `NotFoundError`) if a record is not found or belongs to a different `church_id`.
- This ensures the Application layer (tRPC) can map these to correct HTTP status codes.

## 4. Testing Requirements (Mandatory)
- **Integration**: Run tests against a real PostgreSQL instance (via Docker).
- **Isolation**: Create two churches (A and B) and verify that Repository A cannot see records from Repository B.
- **Atomicity**: Verify that if a slot creation fails within `createWithSlots`, the parent Event is not created.

## 🔗 References
- [Spec 04: Repository Contracts](./04-repository-contracts.md)

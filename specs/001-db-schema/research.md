# Research: Database Schema (Phase 1)

## Needs Clarification Resolutions

### 1. Multi-Tenancy Base Church Management
- **Decision**: The system will NOT support Church creation or management via the UI in this phase. A single "base church" record will be created via a database seed script. All scheduling entities will attach to this `church_id`.
- **Rationale**: The immediate focus is scheduling. Building a multi-tenant management interface right now is out of scope. We just need the structural foundation (`church_id`) present so we don't have to refactor the entire schema later.
- **Alternatives considered**: Creating a full Church management CRUD interface (rejected due to scope creep).

### 2. Cascading Deletes
- **Decision**: Use database-level `CASCADE` constraints for structural hierarchies (e.g., deleting a Ministry deletes its Events and Teams; deleting an Event deletes its TimeSlots). 
- **Rationale**: Prevents orphaned records at the database level and ensures referential integrity without requiring complex application-level cleanup logic.
- **Alternatives considered**: Soft deletes (rejected for Phase 1 complexity, though could be added later if auditing demands it).

### 3. Drizzle ORM Schema Structure
- **Decision**: Define schemas using Drizzle's `pgTable` with explicitly named columns and strict foreign key references.
- **Rationale**: Fits our PostgreSQL target and ensures 100% type safety.
- **Alternatives considered**: Prisma (rejected per project tech stack decisions).

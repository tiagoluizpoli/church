# Spec S2: Migration Strategy

## Purpose
Define how we transition from the current database state (Better Auth only) to the new domain-driven schema, ensuring `User` data is correctly linked to the new `Volunteer` and `Church` entities.

## 1. Initial State
- `user` table exists in `auth.ts`.
- No `church` or `volunteer` records exist.

## 2. Seed/Migration Steps
1. **Initialize Church**: Create the first "System Church" record.
2. **Promote Admin**: Identify the first user (by email) and link them to the Church as an `ADMIN`.
3. **Lazy-Create Volunteers**:
    - When a User logs in, check if a `Volunteer` record exists for them in their default `Church`.
    - If not, create it automatically (Soft registration).

## 3. Data Integrity
- All existing `user.id` values must be preserved.
- The `Volunteer` table must use a Foreign Key to `user.id` to maintain referential integrity.

## 4. Testing Requirements (Mandatory)
- **Migration**: Verify that running the migration script doesn't lose existing Better Auth sessions.
- **Integration**: Verify that a new User can sign up via Better Auth and be automatically "upgradeable" to a Volunteer once invited to a ministry.
- **Security**: Ensure that no `Volunteer` record can exist without a valid `User` and `Church` link.

## 🔗 References
- [Spec 01: Core Entities](./01-core-entities.md)

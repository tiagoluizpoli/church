# Research: Volunteer Scheduling Migration Strategy

## 1. System Initialization Script

### Decision
Implement a TypeScript script in `packages/database/src/scripts/init-system.ts` that uses a local JSON seed file (`packages/database/seed-data.json`) to bootstrap the first Church and Admin.

### Rationale
Using a JSON seed file is simpler and more reproducible than environment variables for development. It allows for complex initial data structures and can be easily managed (and optionally git-ignored) to avoid polluting the environment.

### Implementation Details
- **Input**: `packages/database/seed-data.json` containing church name, slug, and admin email.
- **Dummy Defaults**: Default to `admin@dummy.com` if no specific email is provided.
- **Operation**:
    1.  Read `seed-data.json`.
    2.  Check if a Church with the given slug already exists.
    2.  If not, create the Church.
    3.  Find the User record in the `user` table (Better Auth) by `email`.
    5.  Create a default "Administration" ministry linked to the Church.
    6.  Link the Volunteer to the "Administration" ministry with a `LEADER` role.

## 2. Lazy Onboarding (Soft Registration)

### Decision
Implement a Better Auth plugin or a tRPC middleware check to trigger the creation of a `Volunteer` record upon successful login.

### Rationale
- **Better Auth Plugin**: Centralizes the logic at the authentication layer. Guaranteed to run on every successful session creation.
- **tRPC Middleware**: Closer to the domain logic. Can be easily scoped to specific procedures.

**Chosen Approach**: Better Auth `hooks.after.sessionCreate` to ensure the `Volunteer` record exists as soon as the user is authenticated.

### Implementation Details
```typescript
// packages/auth/src/index.ts
const auth = betterAuth({
  // ...
  hooks: {
    after: {
      sessionCreate: async (session) => {
        // 1. Check if Volunteer exists for user.id and default church_id
        // 2. If not, create it
      }
    }
  }
})
```

## 3. Data Integrity & Multi-tenancy

### Decision
Enforce `church_id` at the database level using `notNull()` and foreign keys.

### Rationale
Hard-coding the isolation at the schema level prevents accidental data leakage even if application logic fails.

### Alternatives Considered
- **Application-level filtering**: Rejected because it's prone to human error (forgetting a `where` clause).
- **Postgres Row Level Security (RLS)**: Evaluated but rejected for initial phase to keep complexity low and maintain compatibility with Drizzle's standard patterns.

## 4. Open Questions

- **Q1**: What should be the default `church_id` for "Soft Registration" in a multi-tenant environment?
    - *Assumption*: Initially, all users belong to the "System Church" unless specified otherwise.
- **Q2**: Should the "System Church" be created automatically by the database migration or by a separate seed script?
    - *Assumption*: A separate seed script is safer as it involves data (name/slug) that might change per environment.

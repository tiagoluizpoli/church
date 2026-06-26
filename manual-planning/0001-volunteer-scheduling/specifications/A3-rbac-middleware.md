# Spec A3: RBAC Middleware (tRPC)

## Purpose
Implement reusable tRPC middleware for enforcing ministry-level and church-level permissions.

## 1. Middleware Types
- `churchAdminProcedure`: Only users with global admin role (defined as a `leader` in the `Administration` ministry).
- `ministryLeaderProcedure`: Only users with `leader` role in the target ministry. Inspects `rawInput` for `ministryId`, `eventId`, or `slotId` (resolving parent ministry if needed).
- `teamLeaderProcedure`: Only users with `sub_leader` role in the target team.

## 2. Logic & Rules
1. **Context Caching**: On first request, resolve the volunteer profile and roles globally and cache them in the tRPC `Context` (`ctx.volunteer` and `ctx.ledMinistries`) to avoid redundant DB queries.
2. **Role Hierarchy**:
   - `churchAdminProcedure` allows access to all endpoints.
   - `ministryLeaderProcedure` allows access to `CHURCH_ADMIN` and `MINISTRY_LEADER`.
   - `teamLeaderProcedure` allows access to `CHURCH_ADMIN`, `MINISTRY_LEADER`, and `SUB_LEADER` for the target team.
3. **Target Extraction**: Inspect `opts.rawInput`. If target resource (e.g., event, slot) does not exist or belongs to a different church, throw `UNAUTHORIZED` directly to prevent resource enumeration.

## 3. Testing Requirements (Mandatory)
- **Unit/Integration**: Verify that the middleware correctly blocks access when the join table record is missing.
- **Unit/Integration**: Verify that `churchAdmin` role overrides any ministry-level check.
- **Unit/Integration**: Verify that `ministryLeader` overrides `teamLeader` checks.
- **Security**: Verify that invalid or non-existent target resource IDs return `UNAUTHORIZED`.

## 🔗 References
- [Spec 09: Permissions & RBAC](./09-permissions-rbac.md)

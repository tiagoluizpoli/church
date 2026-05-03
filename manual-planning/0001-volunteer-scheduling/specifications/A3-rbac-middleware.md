# Spec A3: RBAC Middleware (tRPC)

## Purpose
Implement reusable tRPC middleware for enforcing ministry-level and church-level permissions.

## 1. Middleware Types
- `churchAdminProcedure`: Only users with global `ADMIN` role.
- `ministryLeaderProcedure`: Only users with `LEADER` role in the specified `ministry_id`.
- `teamLeaderProcedure`: Only users with `SUB_LEADER` role in the specified `team_id`.

## 2. Logic
1. Extract `userId` from the session.
2. Query the `Ministry_Volunteer` join table for the given `ministry_id`.
3. Verify the `system_role`.
4. If valid, proceed and attach the `role` and `churchId` to the context.

## 3. Testing Requirements (Mandatory)
- **Unit**: Verify that the middleware correctly blocks access when the join table record is missing.
- **Unit**: Verify that `churchAdmin` role overrides any ministry-level check.

## 🔗 References
- [Spec 09: Permissions & RBAC](./09-permissions-rbac.md)

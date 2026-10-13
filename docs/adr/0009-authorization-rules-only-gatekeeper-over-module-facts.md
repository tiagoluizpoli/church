# Authorization is a rules-only gatekeeper over facts owned by their modules

## Status

accepted

## Context

The app will grow from scheduling into a whole church system, and the MVP adds new write paths for access (make or remove admin, change Ministry level, grant leader on accept). Today Church access is Better Auth `member.role` and Ministry leadership is `ministry_volunteer.ministry_access_level`, both read by `AuthorityService`, but a few checks bypass it (`VolunteerRepository.isChurchAdmin`) and paths that assume a Volunteer profile answer 401 to admins without one. Decided in the MVP Journeys map ticket [Authorization model: where Church and Ministry authority live](https://github.com/tiagoluizpoli/church/issues/400).

## Decision

- **One gatekeeper, rules only.** `AuthorityService` is the single place that answers "may this person do this here?" for every module. It stores nothing: each request resolves the caller, the Active Church and the target scope, the facts are read from their owners and handed in, and it allows or denies. A new module adds rules (and, when needed, actions beyond `manage` / `participate`), never its own permission table or inline check.
- **Facts stay with their owners.** Church access (`member` / `admin`) is Better Auth `member.role`, used for real; Better Auth's own role-change endpoint is blocked, so every change goes through the app's service with the last-admin guard. Ministry Membership, its Ministry Access Level and Roles stay in the Ministry module, which is the source of truth for who serves and who leads where.
- **Leading stays on Ministry Membership.** A leader holds a Ministry Membership at `leader` level, possibly with no Roles (leads without serving), and therefore an active Volunteer profile in that Church; accepting a leader invitation creates the profile if missing. No data migration.
- **Status codes.** 401 only for "not signed in"; 403 when the caller lacks the capability; 404 for an object outside the caller's scope. Missing a Volunteer profile is never a 401: such paths ask the gatekeeper.
- **Teams leave the gatekeeper.** The `team` resource and Team facts are removed with the parked Teams code; Team tables stay as data.

## Considered Options

- **A central grant table for every permission** (admin, leader, future modules), with Better Auth holding sign-in only. Rejected: it leaves `member.role` unread, and copies facts that their modules already own.
- **Ministry leadership in Better Auth teams.** Rejected: Better Auth roles are church-wide and team members carry no role, so every Ministry would be copied into Better Auth and the leader check would still be ours.
- **Ministry Membership keyed to the Church Member instead of the Volunteer profile**, so a Person serving in one Church can lead in another. Rejected for the MVP: a data migration and new Volunteer Transfer rules for a case no Flow needs while there is one Church.

## Consequences

- A Person can lead Ministries only in the one Church where they volunteer. Revisit when a second Church is onboarded (parked in [MVP parked ideas](https://github.com/tiagoluizpoli/church/issues/396)).
- Finer permissions later are added inside `AuthorityService` as new actions or rules over the same facts.

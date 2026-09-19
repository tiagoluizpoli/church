# Feature Specification: TeamLeader Scheduling Capabilities

**Feature Branch**: `025-teamleader-scheduling-capabilities`

**Created**: 2026-09-19

**Status**: Ready for implementation

**Input**: BL-017, church#20, and ADR-0004.

---

## Problem Statement

A TeamLeader has authority only over explicitly led Teams. The current Scheduling navigation derives a single boolean from Ministry leadership, so a TeamLeader-only caller has no Scheduling entry even when they may roster their Team. A caller who leads a Ministry in one area and only a Team in another cannot be represented by one global role: treating the highest role as global would expose Ministry-management work outside their authority.

## Solution

Provide a server-produced, Active-Church-scoped Scheduling capability projection and make `/scheduling` a capability index. The index exposes only the Church, Ministry, and Team work a caller may enter. A TeamLeader can roster only led Teams; a Ministry leader manages only led Ministries; a ChurchAdmin receives Church planning. The server enforces every read and mutation through the existing AuthorityService, so the projection is navigation data rather than a second authorization system.

## User Stories

1. As a TeamLeader, I want to see Scheduling when I lead at least one Team, so that I can reach roster work I am permitted to manage.
2. As a TeamLeader, I want Scheduling to list only Teams I lead, so that I never mistake another Team’s work for my responsibility.
3. As a TeamLeader of several Teams, including Teams in different Ministries, I want those Teams grouped by Ministry, so that I can choose the correct roster context.
4. As a TeamLeader with no current roster work, I want to retain a Scheduling entry with an honest empty state, so that access does not disappear merely because no cycle is actionable.
5. As a TeamLeader, I want to view my Team’s needs and Volunteers for current or future locked cycles, so that I can prepare its roster.
6. As a TeamLeader, I want to assign or remove my Team’s Volunteers only while its MinistryParticipation is rostering, so that published schedules and closed work stay stable.
7. As a TeamLeader, I want published and past rosters to be readable but not editable, so that I can refer to service history without changing it.
8. As a TeamLeader, I want Shift times visible without seeing another Team’s requirements, Volunteers, or assignments, so that I can coordinate without receiving broader roster data.
9. As a Ministry leader, I want to enter management work only for Ministries I lead, so that leadership in one Ministry never leaks into another.
10. As a caller who is a Ministry leader in one Ministry and a TeamLeader in another, I want both legitimate entries shown at their real scopes, so that the broader Ministry authority does not over-grant access in the other Ministry.
11. As a caller who leads a Team inside a Ministry I already lead, I want one Ministry entry rather than a redundant Team entry, so that the index stays concise.
12. As a ChurchAdmin without a Volunteer profile, I want to enter Church planning, so that Church authority does not depend on Volunteer participation.
13. As a Volunteer with no scheduling authority, I want Scheduling omitted, so that navigation does not advertise work I cannot perform.
14. As a caller opening a deep link outside my scope, I want a safe return to my permitted Scheduling index or Dashboard, so that the application does not disclose whether the requested resource exists.
15. As a caller whose leadership changed during an open session, I want the next protected navigation or action to revalidate my access, so that removed authority cannot be used from stale UI state.
16. As a caller during a temporary capability-loading failure, I want a retryable error state instead of guessed access, so that transient failure neither hides permanent authority nor grants it.

## Implementation Decisions

- Use one read seam: a Scheduling capability projection resolved server-side from the existing AuthorityService against the Active Church. It reports only permitted entries and is not itself an authority grant.
- The projection represents three entry kinds: Church planning, Ministry management, and Team rostering. It carries the resource identity and display information needed by the capability index; it does not expose global role names as a substitute for scope.
- The capability index replaces the global-role redirect from `/scheduling`. Its navigation is resource-scoped: ChurchAdmins receive planning, Ministry leaders receive each led Ministry, and TeamLeaders receive each otherwise-unavailable led Team, grouped by Ministry.
- When a caller leads a Ministry and a Team within that same Ministry, omit the Team entry. When the caller is a Ministry leader in one Ministry and a TeamLeader in another, retain both legitimate entries without broadening either scope.
- Derive Scheduling nav visibility from the capability projection, not from a successful or forbidden business-data request. Hide the nav while the projection resolves.
- Team-roster work exposes only the TeamLeader’s led-Team requirements, Volunteers, and assignments. It may expose Shift timing, but never another Team’s staffing or roster data.
- TeamLeaders may assign or remove assignments only for led Teams and only while the owning MinistryParticipation is in `rostering`. They may read current and future locked rosters; published and past rosters are read-only. They cannot plan, tailor Ministry requirements, publish, or manage another Team.
- Every resource read and mutation remains authorized by AuthorityService. The capability projection and client-side route handling improve navigation and experience; they never replace server authorization.
- A direct link outside a caller’s scope returns a caller with any Scheduling capability to the index, without revealing whether the target exists. A caller without any Scheduling capability returns to Dashboard.
- A capability-query failure is not a denial or grant. The index presents retryable failure UI. No live permission push is introduced; protected navigation and requests revalidate authority.
- No schema, membership-model, or access-level change is required.

## Testing Decisions

- Test externally observable authorization behavior, visible entries, allowed actions, denied actions, redirects, and disclosed data; do not test internal query ordering or implementation-specific role checks.
- Extend the existing AuthorityService and authority-manager tests to establish the capability projection’s Church, Ministry, and Team behavior, including mixed scopes and a ChurchAdmin without a Volunteer profile.
- Add an API contract test for the capability projection and for non-disclosing wrong-scope behavior. Its assertions must distinguish a caller who has no Scheduling capability from one who has a different permitted scope, without revealing target existence.
- Add component tests for the capability index’s grouping, de-duplication, loading, empty, and retry states.
- Add browser coverage using the established scheduling guard patterns: ChurchAdmin without a Volunteer profile, Ministry leader, TeamLeader-only, a mixed MinistryLeader/TeamLeader across different Ministries, plain Volunteer, wrong-scope deep links, published versus rostering states, and authority removal between protected requests.
- Verify that TeamLeader-visible data never includes another Team’s requirements, Volunteers, or assignments, even when the Teams share a Shift.

## Out of Scope

- A broader review or redesign of the application’s end-to-end screen workflow and visual composition. That work may change presentation, but not this scope contract.
- Changes to Church, Ministry, Team, Volunteer, or Access Level terminology and membership semantics.
- A global role hierarchy, flat session role claim, or client-side authorization source.
- Live permission push, websocket-driven nav updates, or other real-time access synchronization.
- Ministry planning, tailoring, publishing, invitation authority, and other Ministry-wide actions for TeamLeaders.
- New notification behavior, new roster-publishing workflow, or schema migration.

## Further Notes

BL-021 and BL-011 are no longer blockers: the authenticated route tree and AuthorityService already exist. This specification preserves the planned later workflow review while making the authorization boundaries implementable now.

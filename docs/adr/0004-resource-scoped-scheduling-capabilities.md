# Resource-Scoped Scheduling Capabilities

## Status

accepted

## Context

Team leadership is not a Ministry-wide deputy role: a TeamLeader manages only explicitly led Teams. A caller can simultaneously lead one Ministry and lead a Team in another, so selecting one global "highest role" would incorrectly grant Ministry-management screens outside their authority. The current Scheduling nav derives one boolean from a Ministry-leadership query, which excludes TeamLeader-only callers and cannot describe the scopes a mixed-capability caller may enter.

## Decision

`/scheduling` is a capability index backed by a server-produced projection. It lists Church planning for a ChurchAdmin, Ministry-management entries only for Ministries the caller leads, and Team-roster entries only for otherwise-unavailable Teams the caller leads. A Team entry is omitted when Ministry leadership already grants the broader workspace for that Ministry.

A TeamLeader may view Team-scoped needs and Volunteers and assign or remove assignments for that Team while its MinistryParticipation is in `rostering`; current and future locked rosters are visible, and published or past rosters are read-only. They cannot plan, tailor a Ministry, publish, or see other Teams' roster details. The server continues to decide every resource action through `AuthorityService`; the projection is navigation data, not authority.

Wrong-scope deep links disclose nothing: a caller with Scheduling access returns to the capability index, and one without it returns to Dashboard. Capability loading never infers permission from failure: nav stays hidden while resolving and the index offers retry on failure. No live push is required after leadership removal; the next protected navigation or query revalidates access.

## Consequences

The old 403-derived `canSeeScheduling` probe must be replaced or derived from the capability projection. The implementation needs server, contract, and browser coverage for ChurchAdmin without a Volunteer profile, Ministry leader, TeamLeader-only, mixed MinistryLeader/TeamLeader across different Ministries, plain Volunteer, wrong-scope deep links, and revoked leadership.

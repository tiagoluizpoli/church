# Children are Family records owned by Guardians, not Persons and not Church-owned

## Status

accepted ([#1079](https://github.com/tiagoluizpoli/church/issues/1079), map [#1072](https://github.com/tiagoluizpoli/church/issues/1072))

## Context

Kids check-in needs children in the system, yet "every Person has exactly one User" and a child never logs in. Families also move between Churches, and the product will serve many Churches, so re-registering a family at each one is friction the product owner rejected.

## Decision

- **A Child is not a Person.** It has no User, no Church Membership and no login, and holds only name, birth date, an optional photo (for pickup verification only) and optional care notes, each under its own Guardian consent. The one-User-per-Person invariant is untouched.
- **A Family belongs to its Guardians, at platform level.** A Guardian is a Person, or a Guardian contact (name and phone, no login) until that adult has an account. A Family is made known to a Church by a **Family Link**, which needs no Church Membership; only linked Churches see its Children.
- **No child CPF or other national identifier.** De-duplication is an invitation from the first Guardian, with a safety net: an exact normalized full-name and birth-date match among Families linked to the same Church asks the existing Guardians to approve a join request. A match never locks anyone out; there is no merge.
- **The app never decides custody.** A Guardian may leave a Family; nobody removes another Guardian. A court order is handled by the Church in person, through its own pickup restriction.

## Considered Options

- **Child as a Person without a User.** Rejected: breaks a structural invariant for a record that never authenticates.
- **Families scoped to one Church (each Church the LGPD controller, platform the operator), with a one-tap copy to a new Church.** Rejected for parents' experience and a single source of truth; copies drift (an allergy updated in one Church but not another).
- **A child's CPF, or a parent's name, as the de-duplication key.** Rejected: CPF fails LGPD minimisation (art. 6 III, 14 §4); each parent gives their own name, so it never matches.

## Consequences

- The platform operator is the LGPD controller of children's data (likely "high risk", so no small-agent exemption): privacy notice, data-subject channel, incident register and probably a DPO. A lawyer confirms before a second Church goes live.
- Withdrawing the check-in consent deletes the Child and anonymises its attendance; photo and care-note consent are withdrawn separately and delete that data at once.
- A restricted parent who remains a Guardian still sees the Child's basic data in the app.

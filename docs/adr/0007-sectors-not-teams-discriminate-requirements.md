# Sectors, not Teams, discriminate staffing requirements

## Status

accepted

## Context

One Ministry often staffs the same Role in several spots or duties within one Shift: Kids needs Teachers in the Babies Room and in the Kids Room; ushers greet at the Main Door, the Side Door, and Visitor Reception; one `Operador de Projeção` runs Templo while another runs Kids. The schema already carried an optional Team on `SlotRequirement`, while `Assignment` carried only Shift + Role, so same-Role requirements in one Shift collapsed together (see BL-032). Decided in the MVP Journeys map ticket [Teams vs. Roles for physical places](https://github.com/tiagoluizpoli/church/issues/368).

## Decision

- **A Sector is a per-Ministry registry of spots or duties.** Every `SlotRequirement` names exactly one Sector (mandatory) and one Role; headcount is per (Sector, Role) within a Shift.
- **Every `Assignment` fills exactly one `SlotRequirement`.** One Assignment per Volunteer per Shift still holds.
- **Eligibility is Role-only.** Nobody is a member of a Sector; a Volunteer qualified for the Role may be placed at any Sector of that Ministry, so rotation between Sectors needs no setup.
- **Teams are parked**, not removed: their tables and rows stay, but they no longer scope requirements (BL-033).

## Considered Options

- **Teams as the discriminator.** Rejected: a Team is a group of people with membership and its own leader, which a spot is not; it would need Team and Team Membership management in the MVP, and rotating operators are not permanent Teams.
- **Spot-specific Roles** ("Babies Room Teacher", "Main Door Usher"). Rejected: Roles are qualifications; this duplicates them, forces re-qualifying everyone for every spot, and would need a migration to undo once real churches hold data.
- **Free-text label on the requirement.** Rejected: spots do not change month to month, and retyping invites typos that split one spot into several.
- **Optional Sector.** Rejected: two shapes of requirement (with and without a Sector) would leak branching into every screen; a Ministry with no split registers one Sector.

## Consequences

- A Ministry cannot set a headcount until it has at least one Sector; the UI points the user to create one.
- Renaming a Sector renames it in history; the UI warns and suggests archiving it and creating a new one instead.

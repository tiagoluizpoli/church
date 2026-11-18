# Decision Memo: Service-First Events and Long-Event Turn Splitting

**Date**: 2026-06-30  
**Context**: Deferred from scheduling-reality-alignment handoff. Two open domain questions needed a decision before next spec lane starts.

---

## Decision 1: Service-First Event Semantics

### Question
Should events model church services (Sunday 8:00, 10:00, 18:30) as top-level objects, with ministries participating in the same service — rather than each ministry owning its own event?

### Decision: Defer service-first to a dedicated future spec lane

**Rationale:**

The current `event.ministryId` model is an acceptable implementation seam for all planned spec lanes. The real church workflow is already achievable:

- Each ministry lead creates an event for their ministry at the same service time (e.g., "Kids - Sunday 10:00", "Worship - Sunday 10:00").
- Parallel staffing per ministry works today through `requiredCount` on each slot.
- Multiple roles on the same slot cover the "5 people needed at the same time" scenario.

What's missing is a **unified service view** across ministries — a leader who wants to see all ministries staffed for the 10:00 service at once. This is a UX gap, not a domain modeling gap. No data is wrong; it's just not surfaced together.

**When to revisit**: Once there is a concrete user request for a cross-ministry service view or a coordinator-level dashboard. That becomes its own spec lane ("Service Builder" or "Service View"). Until then, enforcing a service-first schema would add complexity without an active consumer.

**What stays the same**: `event.ministryId` remains the seam. No schema changes needed to unblock current work.

---

## Decision 2: Long-Event Turn Splitting

### Question
When an event spans a long window (e.g., 12:00–22:00), should the slot-generate wizard offer split turns? If so: count-first, duration-first, or both? Should "split into turns" become product-wide language?

### Decision: Count-first split only; wizard-scoped language; custom spans deferred

**Rationale:**

**Count-first is the right default.** Leaders think in terms of "I need 2 shifts" or "I want 3 turns," not "each turn should be 3h20m." Providing a turn count and dividing the event window evenly satisfies the common case. Duration-first adds friction without a clear advantage — if leaders know the duration they want, they can work backwards to count.

**Split language stays in the wizard.** The slot-generate wizard is the only place where turns are actively created. Propagating "split into turns" phrasing to the main builder, slot row headers, or sidebar would add noise for the default case (most events are single-slot). Keep the language isolated to the wizard empty state and the "Add turns" path.

**Custom spans deferred.** Arbitrary per-turn start/end times (e.g., turns that don't divide evenly) are rare and add significant UI complexity. No user has requested this explicitly. Implement only when a concrete case arises.

**Current state**: The wizard already offers count-based splitting constrained to the event window. The empty state copy now correctly frames the common path (single slot) vs. the special case (split turns). This is sufficient.

---

## Next Steps

Neither decision requires code changes. Both decisions allow the next spec lane to start without waiting.

Suggested next spec lane: see `manual-planning/0001-volunteer-scheduling/BACKLOG.md` for prioritized options.

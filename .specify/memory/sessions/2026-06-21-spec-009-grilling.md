# Spec 009 grilling session — 2026-06-21

Scope: `specs/009-repo-interfaces/`

Decisions confirmed with user:

1. Canonical audit identity term is `actorId`, not `leaderId`.
   - Rationale: audit actions may be performed by volunteers, leaders, admins, or future system actors.
   - Follow-up alignment needed in D1/L2/entity docs still using `leaderId`.

2. `TimeSlotRepository` should expose direct slot lookup by ID.
   - Adopted shape: `getById(churchId, slotId): Promise<TimeSlot>`.
   - Rationale: Spec L3 replacement flow can start from `slotId` without requiring an event-wide preload.

3. `VolunteerRepository` stays data-access only.
   - Keep `listQualifiedForRole(...)`.
   - Do not hide availability, overlap, decline-history, or workload logic inside repository methods.
   - Those remain domain-service concerns coordinated across Availability/Assignment repositories and domain services.

4. Repository contracts stay explicit about time windows.
   - Use caller-provided `startTime` / `endTime` bounds.
   - Do not infer business concepts like "current scheduling period" inside repositories.

5. Default repository behavior returns active / non-deleted records only.
   - Archived or soft-deleted data requires explicit opt-in methods/variants.

6. Read methods may also accept optional `tx?: TransactionContext` when they need to participate in a UnitOfWork.
   - Rationale: preserves read-your-writes consistency inside transactional workflows.

7. `TimeSlotRepository.getById` and `listByEvent` return fully hydrated `TimeSlot` objects including nested `requirements`.

8. Workload/fairness counting stays domain-neutral.
   - Repository contracts should accept explicit status filters or equivalent caller-supplied criteria rather than hardcoding which assignment statuses count.

9. `AvailabilityRepository.delete(...)` remains contract-neutral.
   - Infrastructure may implement hard delete or soft delete underneath without changing the domain contract.

10. `ChurchRepository.getBySlug` stays a required `get*` lookup, not `find*`.
    - Rationale: in this domain, a missing church slug is treated as an error path, not routine absence.

11. No inline object typing in call-facing contracts.
    - Every non-trivial parameter shape must be a separately declared named `type` or `interface`.
    - When touching existing code that violates this rule, fix it in the same change.
    - Repository method inputs should use named shapes such as `CreateEventInput` rather than vague `data` parameters.

12. Ordering guarantees should be specified only where order is semantically part of behavior; otherwise callers must sort explicitly.

13. Spec D1 and Spec L2 are aligned to `actorId` as the canonical audit identity term.

14. `AssignmentAuditRepository.create(...)` should use a named input type such as `CreateAssignmentAuditInput`.

15. Audit list methods default to newest-first ordering by timestamp.

16. `EventRepository.listByMinistry(...)` defaults to chronological ascending order by event start time.

17. `countByVolunteerInPeriod(...)` is renamed to `countByVolunteerInRange(...)` to match explicit `startTime`/`endTime` semantics.

18. `ChurchRepository.getBySlug(...)` should accept a branded domain slug type such as `ChurchSlug`, not a plain string.

19. Audit list methods do not gain time-range filters in v1.
    - Scope stays limited to known downstream needs unless another spec proves the requirement.

20. `RoleRepository.listByMinistry(...)` defaults to alphabetical ascending order by role name.

21. `MinistryRepository.listByChurch(...)` defaults to alphabetical ascending order by ministry name.

Files touched during session:
- `CONTEXT.md` — added Actor glossary term and example dialogue.
- `specs/009-repo-interfaces/spec.md` — recorded the adopted decisions above.

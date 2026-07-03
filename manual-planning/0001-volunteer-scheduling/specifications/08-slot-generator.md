# Spec 08: Domain Service — Slot Generator

## Purpose
Automate the creation of complex time slot structures based on event duration and ministry templates.

---

## 1. Generation Strategies

### I. Equal Split
- **Input**: Event duration (e.g., 2 hours), Slot duration (e.g., 30 mins).
- **Output**: 4 sequential slots.

### II. Template-Based
- **Input**: Ministry "Sunday Morning" template.
- **Output**: Predefined slots like "Pre-service (8:00-8:30)", "Service (8:30-10:00)", "Cleanup (10:00-10:30)".

**Refined (017, 2026-07-02):** There are now **two generators**:
- **(a) Cycle event generation** — applying an `EventTemplate` to a `PlanningCycle` creates one `Event` per matching date and one church-level `TimeSlot` per `TimeBlock` (each recording `sourceTemplateBlockId`). This replaces the old ministry-owned "Template-Based" slot generation.
- **(b) Per-ministry `Shift` creation** — inside a `MinistryParticipation`, a `TimeSlot` is split into `Shift`s either by equal division into N parts or by manual (possibly unequal) times, bounds-enforced within the parent TimeSlot. (see ADR 0002 / CONTEXT.md)

---

## 2. Requirement Inheritance
- When slots are generated, they automatically inherit the `SlotRequirement` (Role + Count) from the parent Ministry settings or the chosen Template.

**Refined (017, 2026-07-02):** Remove the "inherit `SlotRequirement` from … Template" behavior — `RoleTemplate` is deleted for MVP (BL-009). Per-`Shift` counts now seed from the ministry's **`MinistryServingProfile`** (recurring) or from copying a profile block / manual entry (dynamic events). (see ADR 0002 / CONTEXT.md)

---

## 3. Testing Requirements (Mandatory)
- **Unit**: Verify that `Equal Split` handles remainders (e.g., 65 mins / 30 mins slot).
- **Unit**: Verify that `Template-Based` generation correctly copies the `required_count` for each role.
- **Integration**: Verify that generating slots for a 2-day event correctly labels them with the date.
- **Transactional**: Verify that if requirement creation fails, the entire slot batch is rolled back.

# Implementation Plan: Slot & Assignment Manager (Spec L3)

**Branch**: `008-assignment-manager` | **Date**: 2026-05-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-assignment-manager/spec.md`

## Summary

The Slot & Assignment Manager is a pure Domain Service that orchestrates the scheduling lifecycle — generating time slots, publishing schedules, managing volunteer confirmations/declines, finding replacements, and handling event cancellation cascades. It integrates with the Availability Engine (L1) for replacement searches and the Conflict Validation Service (L2) for hard constraint re-validation at publish time. Like its predecessors, it receives all data through function arguments and returns domain objects — no database access, no side effects.

## Technical Context

**Language/Version**: TypeScript 5+ (Bun)

**Primary Dependencies**: None (Pure Domain Logic). Consumes types from L1 (`TimeRange`, `AvailabilityCheckRequest`) and L2 (`HardConstraintReason`). Calls `ConflictValidationService.validate()` for hard constraint re-validation at publish.

**Storage**: N/A (Domain Service receives injected data and returns domain objects)

**Testing**: Vitest (Unit Testing) — 79 test cases identified in [test-coverage-plan.md](./tests/test-coverage-plan.md)

**Target Platform**: Node/Bun Backend

**Project Type**: Domain Service / Library

**Performance Goals**: Sub-millisecond operations — pure type checks, array operations, and date math

**Constraints**: Pure logic, 100% type safety, zero database coupling, zero infrastructure dependencies

**Scale/Scope**: ~300-400 LOC service + ~150 LOC types + ~80 LOC error classes + entity extensions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Domain-First Architecture**: Confirmed. Pure domain service with no infrastructure coupling. Follows DDD principles — business logic is separated from framework-specific code. Same `as const` object pattern as L1 and L2.
- [x] **II. Full-Stack Type Safety**: Confirmed. All types are strict TypeScript with discriminated unions (`SlotGenerationStrategy`, `SoftConflictResult`). No `any` or `unknown` casts. Extends existing typed infrastructure.
- [x] **III. Container-Ready Infrastructure**: N/A — no infrastructure components in this service.
- [x] **IV. Environment Discipline**: N/A — no environment variables needed for a pure domain service.
- [x] **V. Automated Code Standards**: Confirmed. Biome will lint and format. Follows established patterns from L1 and L2.
- [x] **VI. Maximum Context Specification**: Confirmed. Related specs traversed: `L3-assignment-manager.md`, `08-slot-generator.md`, `12-lifecycle-rules.md`, `D1-domain-entities.md`, L1 spec/data-model, L2 spec/data-model/plan, all entity source files, existing test structure.

## Project Structure

### Documentation (this feature)

```text
specs/008-assignment-manager/
├── plan.md                         # This file
├── research.md                     # Phase 0 output
├── data-model.md                   # Phase 1 output
├── quickstart.md                   # Phase 1 output
├── tests/
│   └── test-coverage-plan.md       # 79 identified test cases
└── tasks.md                        # Phase 2 output (via /speckit-tasks)
```

### Source Code (repository root)

```text
packages/api/src/domain/
├── assignment/                              # NEW directory
│   ├── assignment-manager-service.ts        # Main service (7 public methods)
│   ├── types.ts                             # All new types
│   ├── errors/
│   │   ├── publish-validation-error.ts      # Wraps stale hard constraint failures
│   │   ├── invalid-state-transition-error.ts # Invalid status transitions
│   │   ├── empty-schedule-error.ts          # Zero assignments at publish
│   │   └── duplicate-slots-error.ts         # Slots already exist on event
│   └── index.ts                             # Barrel export
├── entities/
│   ├── event.ts                             # MODIFIED: add 'past' status + markAsPast()
│   ├── assignment.ts                        # MODIFIED: add 'draft'/'cancelled' + new methods
│   ├── time-slot.ts                         # MODIFIED: add status field + cancel()
│   └── assignment-audit.ts                  # MODIFIED: add event_published/event_cancelled actions
├── errors/
│   └── index.ts                             # MODIFIED: re-export assignment errors
└── index.ts                                 # MODIFIED: export assignment module

packages/api/tests/domain/
├── assignment-manager-service.test.ts       # NEW: 65 test cases for service
├── entities/
│   ├── event.test.ts                        # MODIFIED: add tests for 'past' status
│   ├── assignment.test.ts                   # MODIFIED: add tests for 'draft'/'cancelled'
│   ├── time-slot.test.ts                    # MODIFIED: add tests for status field
│   └── assignment-audit.test.ts             # MODIFIED: add tests for new actions
└── errors.test.ts                           # MODIFIED: add tests for new error classes
```

**Structure Decision**: The service lives inside `packages/api/src/domain/assignment/` following the same module-per-service pattern as `availability/` and `conflict/`. Entity extensions are in-place modifications to existing files. Tests follow the established `packages/api/tests/domain/` convention.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. The service is a pure function pipeline with type-safe inputs and outputs.

### Notable Entity Modifications (Non-Breaking)

| Entity | Change | Impact |
|--------|--------|--------|
| `Event` | Add `'past'` status + `markAsPast()` | Additive — existing code unaffected |
| `Assignment` | Add `'draft'`, `'cancelled'` statuses + methods, change default from `'pending'` to `'draft'` | **Default change** — existing tests for assignment will need update |
| `TimeSlot` | Add `status` field + `cancel()` | Additive — new required field with default |
| `AssignmentAudit` | Add `'event_published'`, `'event_cancelled'` actions | Additive — existing code unaffected |

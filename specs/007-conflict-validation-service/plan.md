# Implementation Plan: Conflict & Validation Service (Spec L2)

**Branch**: `007-conflict-validation-service` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-conflict-validation-service/spec.md`

## Summary

The Conflict & Validation Service is a pure Domain Service that enforces scheduling constraints during volunteer assignment creation. It implements a two-phase validation pipeline: **Hard Constraints** (non-overridable blockers that throw `HardConstraintError`) followed by **Soft Conflicts** (warnings that accumulate into a `ConflictReport` allowing leader overrides with an auditable reason). The service integrates with the existing Availability Engine (Spec L1) by consuming its `AvailabilityResult` as injected data, and produces `AssignmentAudit` entities for override tracking.

## Technical Context

**Language/Version**: TypeScript 5+ (Bun)

**Primary Dependencies**: None (Pure Domain Logic). Consumes `AvailabilityResult` from Spec L1's types.

**Storage**: N/A (Domain Service receives injected data and returns domain objects)

**Testing**: Vitest (Unit Testing)

**Target Platform**: Node/Bun Backend

**Project Type**: Domain Service / Library

**Performance Goals**: Sub-millisecond validation — pure type checks and comparisons

**Constraints**: Pure logic, 100% type safety, zero database coupling, zero infrastructure dependencies

**Scale/Scope**: ~150-250 LOC service + ~50 LOC types + ~30 LOC error class

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Domain-First Architecture**: Confirmed. Pure domain service with no infrastructure coupling. Follows DDD principles — business logic is separated from framework-specific code.
- [x] **II. Full-Stack Type Safety**: Confirmed. All types are strict TypeScript with discriminated unions (`SoftConflictResult`). No `any` or `unknown` casts. Extends existing typed infrastructure (`DomainError`, `Entity<T>`).
- [x] **III. Container-Ready Infrastructure**: N/A — no infrastructure components in this service.
- [x] **IV. Environment Discipline**: N/A — no environment variables needed for a pure domain service.
- [x] **V. Automated Code Standards**: Confirmed. Biome will lint and format this service. Follows established patterns from `AvailabilityEngine`.
- [x] **VI. Maximum Context Specification**: Confirmed. Related specs traversed: `L2-conflict-service.md`, `07-conflict-validation.md`, `D1-domain-entities.md`, `L1` spec/plan/data-model, existing domain entity source code, existing error hierarchy, existing test structure.

## Project Structure

### Documentation (this feature)

```text
specs/007-conflict-validation-service/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit-tasks)
```

### Source Code (repository root)

```text
packages/api/src/domain/
├── conflict/                           # NEW directory
│   ├── conflict-validation-service.ts  # Main service (validate + authorizeOverride)
│   ├── types.ts                        # All new types (ConflictReport, ValidationRequest, etc.)
│   └── errors/
│       ├── hard-constraint-error.ts    # HardConstraintError extending DomainError
│       ├── unauthorized-override-error.ts  # UnauthorizedOverrideError
│       └── invalid-override-reason-error.ts # InvalidOverrideReasonError
├── entities/
│   └── assignment-audit.ts             # MODIFIED: add overrideConflictTypes field
├── errors/
│   └── index.ts                        # MODIFIED: re-export hard-constraint-error
└── index.ts                            # MODIFIED: export conflict module

packages/api/tests/domain/
├── conflict-validation-service.test.ts # NEW: unit tests for both phases
└── availability-engine.test.ts         # EXISTING: unchanged
```

**Structure Decision**: The service lives inside `packages/api/src/domain/conflict/` following the same pattern as `packages/api/src/domain/availability/`. Tests follow the existing `packages/api/tests/domain/` convention. The error class goes in a nested `errors/` directory within the conflict module (matching the domain-level `errors/` pattern) and is also re-exported from the domain-level errors barrel.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. The service is a pure function pipeline with type-safe inputs and outputs.

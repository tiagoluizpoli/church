# Implementation Plan: Availability Engine (Spec L1)

**Branch**: `006-availability-engine` | **Date**: 2026-05-15 | **Spec**: [specs/006-availability-engine/spec.md](../spec.md)

**Input**: Feature specification from `specs/006-availability-engine/spec.md`

## Summary

The Availability Engine is a pure Domain Service responsible for calculating whether a volunteer is available for a given time window by checking against their existing blockouts and assignments. It enforces strict mathematical bounds for time overlap and evaluates `is_all_day` rules within the `church_id` isolation context.

## Technical Context

**Language/Version**: TypeScript 5+ (Bun)

**Primary Dependencies**: None (Pure Domain Logic)

**Storage**: N/A (Domain Service receives injected arrays/iterables of data)

**Testing**: Vitest (Unit Testing)

**Target Platform**: Node/Bun Backend

**Project Type**: Domain Service / Library

**Performance Goals**: High-speed mathematical interval overlap calculations

**Constraints**: Pure logic, 100% type safety, zero database coupling

**Scale/Scope**: ~100-200 LOC per service class

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Domain-First Architecture**: Confirmed. This is a pure domain service.
- [x] **II. Full-Stack Type Safety**: Confirmed. Strict TS without `any`.
- [x] **V. Automated Code Standards**: Confirmed. Biome will lint this service.
- [x] **VI. Maximum Context Specification**: Confirmed. Related specs were traversed.

## Project Structure

### Documentation (this feature)

```text
specs/006-availability-engine/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── quickstart.md        # Phase 1 output
```

### Source Code (repository root)

```text
src/
└── api/
    └── domain/
        └── availability/
            ├── AvailabilityEngine.ts
            ├── AvailabilityEngine.test.ts
            └── types.ts
```

**Structure Decision**: The logic will reside inside `src/api/domain/availability` adhering strictly to the DDD structure defined in the project.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Pure mathematical overlap functions are inherently simple.

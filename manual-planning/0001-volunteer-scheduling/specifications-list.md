# Volunteer Scheduling: Layered Implementation Roadmap

This roadmap follows a **Clean Architecture (Ground-Up)** approach. Each "Piece" must be fully specified and tested before moving to the next layer.

> **⚠️ Reshape in progress (2026-07-02) — Spec 017: Scheduling Reshape.** The domain has been re-centred on **church-owned Events planned in `PlanningCycle`s, generated from `EventTemplate`s, and tailored per ministry via `MinistryParticipation`/`Shift`**. Many entries below still describe the pre-reshape (ministry-owned, single-event) model and carry superseding notes. Authoritative sources: [`CONTEXT.md`](../../CONTEXT.md), [`docs/adr/0001`](../../docs/adr/0001-church-owned-events-and-planning-cycles.md), [`docs/adr/0002`](../../docs/adr/0002-church-timeslots-ministry-shifts.md), and [`refinement-02-scheduling-reshape.md`](./refinement-02-scheduling-reshape.md). See the **Spec 017** section below.

## Phase 1: Persistence Layer (The Schema)
*Objective: Define the data structures in the database.*
- **[✅ Spec S1: Database Schema](./specifications/S1-db-schema.md)**: Drizzle ORM definitions for Church, Ministry, Team, Volunteer, Event, Slot, and Requirement.
  - *Refines:* [01-core-entities.md](./specifications/01-core-entities.md), [02-event-slots.md](./specifications/02-event-slots.md), [03-assignments-availability.md](./specifications/03-assignments-availability.md), [05-onboarding-links.md](./specifications/05-onboarding-links.md)
- **[✅ Spec S2: Migration Strategy](./specifications/S2-migration-strategy.md)**: Transitioning from existing Better Auth tables.
  - *Refines:* [01-core-entities.md](./specifications/01-core-entities.md)
- **[✅ Spec S3: Local Development Seeding](./specifications/S3-local-seeding.md)**: Generators for realistic mock data (Ministries, Roles, Teams, Volunteers) for UI testing.
- **[✅ Spec S4: Timezone & Date Policy](./specifications/S4-timezone-policy.md)**: Strict policies for storing dates in UTC and displaying them in local time securely.

## Phase 2: Domain Layer (The Entities & Services)
*Objective: Define the core business entities and logic.*
- **[✅ Spec D1: Domain Entities](./specifications/D1-domain-entities.md)**: Pure TypeScript interfaces for core entities (Church, Volunteer, Assignment, etc.).
- **[✅ Spec L1: Availability Engine](../../specs/006-availability-engine/spec.md)**: Calculating volunteer states and workload balance.
  - *Refines:* [06-availability-engine.md](./specifications/06-availability-engine.md)
- **[✅ Spec L2: Conflict & Validation Service](../../specs/007-conflict-validation-service/spec.md)**: Rules for double-booking and override auditing.
  - *Refines:* [07-conflict-validation.md](./specifications/07-conflict-validation.md)
- **[✅ Spec L3: Slot & Assignment Manager](../../specs/008-assignment-manager/spec.md)**: Lifecycle rules (Draft vs Published), cancellations, and substitutions.
  - *Refines:* [08-slot-generator.md](./specifications/08-slot-generator.md), [12-lifecycle-rules.md](./specifications/12-lifecycle-rules.md)

## Phase 3: Infrastructure Layer (The Repositories)
*Objective: Define the data access contracts and their implementations.*
- **[✅ Spec R1: Repository Interfaces](../../specs/009-repo-interfaces/spec.md)**: TypeScript interfaces (Contracts) for all entities, returning Domain Entities (Spec D1).
  - *Refines:* [04-repository-contracts.md](./specifications/04-repository-contracts.md)
- **[✅ Spec R2: Drizzle Implementations](./specifications/R2-drizzle-repos.md)**: Concrete classes with `churchId` isolation and mapping between Schema (Spec S1) and Domain Entities (Spec D1).
  - *Refines:* [04-repository-contracts.md](./specifications/04-repository-contracts.md)

## Phase 4: Application Layer (The API)
*Objective: Expose the system via tRPC.*
- **[✅ Spec A1: Admin & Leader API](./specifications/A1-admin-api.md)**: Management endpoints for ministries and schedules.
- **[✅ Spec A2: Volunteer API](./specifications/A2-volunteer-api.md)**: Availability submission and confirmation endpoints.
- **[✅ Spec A3: RBAC Middleware](./specifications/A3-rbac-middleware.md)**: tRPC middleware for contextual role enforcement.
- **[✅ Spec L4: Notification Service](./specifications/L4-notification-service.md)**: Triggering PWA Web Push and in-app alerts.
- **[✅ Spec L5: Background Workers & Cron](./specifications/L5-background-workers.md)**: Managing 24h reminders and cleanup.

## Phase 5: Presentation Layer (The Frontend)
*Objective: Build the user interfaces.*
- **[Spec F0: Global UI Framework](./specifications/F0-global-ui-framework.md)**: Application-wide layout shell, theme providers, and navigation system.
- **[Spec F1: Schedule Builder (Desktop)](./specifications/F1-schedule-builder.md)**: Desktop-first complex drag-and-drop interface.
  - *Refines:* [10-scheduling-api.md](./specifications/10-scheduling-api.md)
- **[Spec F2: Volunteer Dashboard (Mobile/PWA)](./specifications/F2-volunteer-dashboard.md)**: Canonical volunteer dashboard for availability tasks, assignments, scheduling notifications, and read-only ministry schedule visibility.
  - *Refines:* [03-assignments-availability.md](./specifications/03-assignments-availability.md), [10-scheduling-api.md](./specifications/10-scheduling-api.md)
- **[Spec F3: Onboarding & Invites](./specifications/F3-onboarding-ui.md)**: Registration flow for new volunteers joining via link.
  - *Refines:* [05-onboarding-links.md](./specifications/05-onboarding-links.md), [onboarding-flow.md](./flowcharts/onboarding-flow.md)
- **[Spec F4: Print & Export Service](./specifications/F4-print-export.md)**: High-fidelity printable/image views and formatted Excel (.xlsx) exports (Critical for Ministry Leaders).
- **[Spec F5: Routing & Cache Invalidation](./specifications/F5-routing-state.md)**: TanStack Router structure and React Query invalidation rules for real-time UI updates.

### 🔴 Mandatory Frontend Rule: Strict shadcn/ui Adherence
Everything must be built on top of an existing component from **shadcn/ui**. We will not reinvent the wheel. 
1. **Use existing components**: Always start with an existing shadcn component.
2. **Minimal Modifications**: Make as few modifications as absolutely possible to the standard components.
3. **No Custom Inventions**: If a component does not exist in standard shadcn, **DO NOT CREATE IT FROM SCRATCH**. Stop and bring the requirement to the user, who will find a high-quality community implementation from the shadcn community repository for us to use.

## Phase 6: Orchestration & Quality (Hardening)
*Objective: Finalize the production environment.*
- **[Spec Q1: End-to-End Testing](./specifications/Q1-e2e-testing.md)**: Playwright scenarios for the full scheduling lifecycle.
  - *Flowcharts:* [scheduling-process.md](./flowcharts/scheduling-process.md), [confirmation-flow.md](./flowcharts/confirmation-flow.md), [conflict-override-flow.md](./flowcharts/conflict-override-flow.md)
- **[Spec Q2: Performance Audit](./specifications/Q2-performance.md)**: Optimizing DB queries and frontend bundle size.

---

## 🔄 Spec 017: Scheduling Reshape (Cross-Cutting)

*Objective: Re-centre scheduling on a church-owned calendar planned in cycles, generated from templates, and tailored per ministry. Ships on the completed 016 clean-architecture foundation. Greenfield schema (no migration).*

- **[Spec 017: Scheduling Reshape](../../specs/017-scheduling-reshape/spec.md)** *(not yet generated)* — introduces `PlanningCycle`, `ChurchAdmin`, `EventTemplate` + `TimeBlock`, `MinistryServingProfile`, `MinistryParticipation`, `Shift`, `AvailabilityCheck`; makes `Event` church-owned; splits publish into cycle-lock vs per-participation roster-publish; moves notifications to per-cycle; removes `RoleTemplate`.
  - *Amendment source:* [refinement-02-scheduling-reshape.md](./refinement-02-scheduling-reshape.md)
  - *Decisions:* [ADR 0001](../../docs/adr/0001-church-owned-events-and-planning-cycles.md), [ADR 0002](../../docs/adr/0002-church-timeslots-ministry-shifts.md); glossary in [CONTEXT.md](../../CONTEXT.md)
  - *Refines / supersedes:* [02-event-slots.md](./specifications/02-event-slots.md), [03-assignments-availability.md](./specifications/03-assignments-availability.md), [01-core-entities.md](./specifications/01-core-entities.md), [08-slot-generator.md](./specifications/08-slot-generator.md), [09-permissions-rbac.md](./specifications/09-permissions-rbac.md), [11-notifications.md](./specifications/11-notifications.md), [12-lifecycle-rules.md](./specifications/12-lifecycle-rules.md), [D1-domain-entities.md](./specifications/D1-domain-entities.md), [S1-db-schema.md](./specifications/S1-db-schema.md), [L3-assignment-manager.md](./specifications/L3-assignment-manager.md), [R1-repo-interfaces.md](./specifications/R1-repo-interfaces.md), [A2-volunteer-api.md](./specifications/A2-volunteer-api.md), [A3-rbac-middleware.md](./specifications/A3-rbac-middleware.md), [F1-schedule-builder.md](./specifications/F1-schedule-builder.md), [domain-data-model.md](./domain-data-model.md), [business-overview.md](./business-overview.md), [ui-ux-flow.md](./ui-ux-flow.md)
  - *Flowcharts:* [planning-cycle-lifecycle.md](./flowcharts/planning-cycle-lifecycle.md), [template-generation-flow.md](./flowcharts/template-generation-flow.md), [ministry-tailoring-flow.md](./flowcharts/ministry-tailoring-flow.md), [availability-check-flow.md](./flowcharts/availability-check-flow.md), [scheduling-process.md](./flowcharts/scheduling-process.md), [slot-generation-flow.md](./flowcharts/slot-generation-flow.md)

---

## 🛡️ Mandatory Quality Gates (Every Layer)
1. **100% Type Safety**: No `any` or `unknown` casts.
2. **Church Isolation**: Every query must explicitly or implicitly filter by `church_id`.
3. **Exhaustive Testing**: 
    - **Unit**: Mocked dependencies for logic.
    - **Integration**: Real DB for Repository/Schema tests.
    - **Contract**: Ensuring implementations match interfaces.
    - **E2E**: Full user journey verification.

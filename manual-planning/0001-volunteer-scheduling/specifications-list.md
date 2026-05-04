# Volunteer Scheduling: Layered Implementation Roadmap

This roadmap follows a **Clean Architecture (Ground-Up)** approach. Each "Piece" must be fully specified and tested before moving to the next layer.

## Phase 1: Persistence Layer (The Schema)
*Objective: Define the data structures in the database.*
- **[✅ Spec S1: Database Schema](./specifications/S1-db-schema.md)**: Drizzle ORM definitions for Church, Ministry, Team, Volunteer, Event, Slot, and Requirement.
  - *Refines:* [01-core-entities.md](./specifications/01-core-entities.md), [02-event-slots.md](./specifications/02-event-slots.md), [03-assignments-availability.md](./specifications/03-assignments-availability.md), [05-onboarding-links.md](./specifications/05-onboarding-links.md)
- **[Spec S2: Migration Strategy](./specifications/S2-migration-strategy.md)**: Transitioning from existing Better Auth tables.
  - *Refines:* [01-core-entities.md](./specifications/01-core-entities.md)
- **[Spec S3: Local Development Seeding](./specifications/S3-local-seeding.md)**: Generators for realistic mock data (Ministries, Roles, Teams, Volunteers) for UI testing.
- **[Spec S4: Timezone & Date Policy](./specifications/S4-timezone-policy.md)**: Strict policies for storing dates in UTC and displaying them in local time securely.

## Phase 2: Infrastructure Layer (The Repositories)
*Objective: Define the data access contracts and their implementations.*
- **[Spec R1: Repository Interfaces](./specifications/R1-repo-interfaces.md)**: TypeScript interfaces (Contracts) for all entities.
  - *Refines:* [04-repository-contracts.md](./specifications/04-repository-contracts.md)
- **[Spec R2: Drizzle Implementations](./specifications/R2-drizzle-repos.md)**: Concrete classes with `churchId` isolation and transactional support.
  - *Refines:* [04-repository-contracts.md](./specifications/04-repository-contracts.md)

## Phase 3: Domain Layer (The Services)
*Objective: Implement the core business logic.*
- **[Spec L1: Availability Engine](./specifications/L1-availability-engine.md)**: Calculating volunteer states and workload balance.
  - *Refines:* [06-availability-engine.md](./specifications/06-availability-engine.md)
- **[Spec L2: Conflict & Validation Service](./specifications/L2-conflict-service.md)**: Rules for double-booking and override auditing.
  - *Refines:* [07-conflict-validation.md](./specifications/07-conflict-validation.md)
- **[Spec L3: Slot & Assignment Manager](./specifications/L3-assignment-manager.md)**: Lifecycle rules (Draft vs Published), cancellations, and substitutions.
  - *Refines:* [08-slot-generator.md](./specifications/08-slot-generator.md), [12-lifecycle-rules.md](./specifications/12-lifecycle-rules.md)
- **[Spec L4: Notification Service](./specifications/L4-notification-service.md)**: Triggering PWA Web Push and in-app alerts.
  - *Refines:* [11-notifications.md](./specifications/11-notifications.md)
- **[Spec L5: Background Workers & Cron](./specifications/L5-background-workers.md)**: Managing 24h reminders, expired invite cleanup, and auto-archiving past events.

## Phase 4: Application Layer (The API)
*Objective: Expose the system via tRPC.*
- **[Spec A1: Admin & Leader API](./specifications/A1-admin-api.md)**: Management endpoints for ministries and schedules.
  - *Refines:* [10-scheduling-api.md](./specifications/10-scheduling-api.md), [05-onboarding-links.md](./specifications/05-onboarding-links.md)
- **[Spec A2: Volunteer API](./specifications/A2-volunteer-api.md)**: Availability submission and confirmation endpoints.
  - *Refines:* [10-scheduling-api.md](./specifications/10-scheduling-api.md)
- **[Spec A3: RBAC Middleware](./specifications/A3-rbac-middleware.md)**: tRPC middleware for contextual role enforcement (Leader, Sub-leader, Volunteer).
  - *Refines:* [09-permissions-rbac.md](./specifications/09-permissions-rbac.md)

## Phase 5: Presentation Layer (The Frontend)
*Objective: Build the user interfaces.*
- **[Spec F1: Schedule Builder (Desktop)](./specifications/F1-schedule-builder.md)**: Desktop-first complex drag-and-drop interface.
  - *Refines:* [10-scheduling-api.md](./specifications/10-scheduling-api.md)
- **[Spec F2: Volunteer Dashboard (Mobile/PWA)](./specifications/F2-volunteer-dashboard.md)**: Simplified mobile view for availability and confirmations.
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

## 🛡️ Mandatory Quality Gates (Every Layer)
1. **100% Type Safety**: No `any` or `unknown` casts.
2. **Church Isolation**: Every query must explicitly or implicitly filter by `church_id`.
3. **Exhaustive Testing**: 
    - **Unit**: Mocked dependencies for logic.
    - **Integration**: Real DB for Repository/Schema tests.
    - **Contract**: Ensuring implementations match interfaces.
    - **E2E**: Full user journey verification.

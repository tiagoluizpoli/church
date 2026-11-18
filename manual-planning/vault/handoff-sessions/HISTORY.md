# Historical Handoff Sessions & Decisions History

This file consolidates and archives the chronological history of the project's architecture, domain design, and feature grilling decisions.

---

## 1. 2026-06-29 — F2 Volunteer Dashboard Grilling
- **Scope**: Canonical volunteer-facing dashboard lanes.
- **Key Decisions**:
  - The volunteer dashboard includes four pillars: `Availability needed` (primary), `My Upcoming Assignments`, `Notifications Inbox`, and `Ministry Schedule` (read-only).
  - Availability is scoped per Event. Overlapping availability with an existing assignment warns the user but still allows saving (rollout-friendly under feature flag/Unleash).
  - Push notifications (PWA) act as the primary communication channel to avoid Meta/WhatsApp complexity.
- **Backlog additions**: BL-004 (Now Serving list), BL-005 (reminder cooldowns).

## 2. 2026-06-30 — Service-First Semantics & Long-Event Turn Splitting (Memo)
- **Scope**: Domain modeling questions on event ownership and slot division.
- **Key Decisions**:
  - **Service-First**: Deferred cross-ministry unified service view to a future coordinator-level spec. Relied on `event.ministryId` seam for current lanes.
  - **Turn Splitting**: Count-first split is the default (leaders prefer "split in 3 turns"). Split language remains isolated to the wizard interface. Custom uneven spans deferred.

## 3. 2026-06-30 — Scheduling Reality Alignment
- **Scope**: Usability tweaks and alignment on volunteer vs. leader assignment rules.
- **Key Decisions**:
  - Answering "available" only denotes availability; it must not trigger auto-assignments.
  - Leaders are also volunteers and must be assignable.
  - Fixes implemented for drag overlays, sidebar slot selections, and event-scoped availability visibility.

## 4. 2026-06-30 / 2026-07-01 — Monorepo Architecture Reshape & Grilling
- **Scope**: Clean Architecture / Domain-Driven Design (DDD) enforcement on the backend.
- **Key Decisions**:
  - **DI**: Wired dependency injection utilizing `tsyringe` (`@injectable()` and `@inject()`).
  - **Clean Layers**: Re-structured `apps/server/src/` into:
    - `api/` (Fastify controllers, DTOs, Zod schemas)
    - `application/` (injected aggregate Managers implementing interfaces, transaction Unit of Work)
    - `domain/` (pure entity classes, branded IDs, value objects, domain service interfaces)
    - `infrastructure/` (Drizzle repository implementations, mappers)
    - `main/` (DI registrations, fastify boot sequence)
  - **Transport**: Dropped tRPC completely. Replaced with raw Fastify + `fastify-type-provider-zod`.
  - **Client**: Configured `orval` with `client: 'axios'` to generate typed asynchronous API functions.
  - **Error Handling**: Standardized Fastify `setErrorHandler` mapping Domain Errors to HTTP statuses automatically.

## 5. 2026-07-06 — E2E Scheduling Specs Debugging
- **Scope**: Playwright E2E spec failures on the `018-churchwide-ux-redesign` branch.
- **Key Decisions**:
  - Identified issues where the cycle event generation was producing 0 cards, and roster publish was stuck at `rostering` status.
  - Diagnosed as a dialog race pattern in Playwright's `page.once('dialog', ...)` execution and refactoring regressions in mutation invalidation hooks.

## 6. 2026-07-06 — Planning Page Visual Regressions & IA Restructure
- **Scope**: Layout polishing, select element sizes, and tab routing.
- **Key Decisions**:
  - Found visual mismatch between native `<select>` (Weekday, Ministry, Cycle select inputs) and text `<input>` components. Recommended custom SVG chevron background styling.
  - Resolved vertical scrollbar leakage in the app shell.
  - Re-ordered the navigation tabs to match the natural planning lifecycle: **Planning → Tailoring → Builder events**.

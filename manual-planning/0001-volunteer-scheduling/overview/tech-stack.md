# Tech Stack & Architecture

This document maps the planned technology stack and architectural principles for the Volunteer Scheduling platform.

## Backend Stack
- **Runtime**: Node.js
- **Framework**: Fastify
- **Validation & Types**: Zod (integrated with Fastify for route validation and OpenAPI generation)
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL
- **Authentication & Authorization**: Better-Auth

## Frontend Stack (Web)
- **Framework**: React
- **Bundler/Tooling**: Vite
- **UI Library**: `shadcn/ui` (Strict Adherence)
  - *Rule 1*: Use existing shadcn components for EVERYTHING.
  - *Rule 2*: Make as few modifications as possible.
  - *Rule 3*: Do not create custom components from scratch. If missing, request the user to find a community component.

## Architectural Principles
- **Clean Architecture**: Strict separation of concerns (Routes/Controllers → Services/Use Cases → Repositories).
- **SOLID Principles**: Ensuring modular, testable, and maintainable code.
- **API Design**: RESTful with OpenAPI (Swagger) automatically generated from Fastify+Zod schemas.

---

## Mobile Strategy

**Decision**: Progressive Web App (PWA) / Capacitor Wrapper

For the MVP, we will rely on a **single React/Vite codebase**. The Volunteer interface will be built mobile-first and responsive. This Web App will be installable as a PWA (Progressive Web App) or wrapped in Capacitor for app store distribution if needed.

**Rationale:**
- **Speed to Market**: Avoiding a separate React Native repository cuts UI development and API integration time in half.
- **Simplicity**: Volunteers primarily need simple calendar/time inputs and list views, which modern web technologies handle perfectly without the need for complex native device APIs.
- **Maintenance**: A single codebase ensures that business logic, state management, and updates are synchronized across all platforms instantly.

---

## 🔗 Technical Specifications (Implementation)

The full, layered implementation plan mapping this tech stack to concrete code constraints is available at:
- **[Layered Implementation Roadmap](./specifications-list.md)**

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

# Volunteer Scheduling Planning

This folder contains the product requirements, architectural plans, and domain models for the **Volunteer Scheduling** feature (Epic 0001).

## 📂 Documentation Guide

Use this index to navigate the planning artifacts:

1. **[Business Overview](./business-overview.md)** 
   *(Also available in [Portuguese](./business-overview-pt.md))*
   - Core functional requirements, user flows, and high-level product decisions.
   
2. **[Flowcharts](./flowcharts.md)**
   - Visual Mermaid diagrams representing the Ministry Hierarchy, RBAC, and the Core Scheduling Process.

3. **[Domain & Data Model](./domain-data-model.md)**
   - Definitions of core entities (Ministry, Role, Event, Slot) and validation rules (overlapping, strictness).

4. **[API & Backend Responsibilities](./api-backend-responsability.md)**
   - Backend boundaries, utilizing Fastify, and validation strategies.

5. **[UI / UX Flow](./ui-ux-flow.md)**
   - User interaction design, Desktop-first builder requirements, and UI/UX behaviors.

6. **[Tech Stack & Architecture](./tech-stack.md)**
   - Definition of the chosen technologies (Fastify, Zod, Drizzle, React, Better-Auth).

---
*Note: This documentation is considered the "source of truth" for the MVP implementation. If new business rules emerge, update the relevant file here.*

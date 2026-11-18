# API & Backend Planning — Multi-Slot Scheduling (Fastify)

## Purpose

Define:
- Responsibilities of the backend
- Logical API surface (not implementation)
- Validation boundaries

This is **not a contract yet**, but a planning guide.

---

## Backend Responsibilities

The backend is responsible for:

1. Persisting domain data
2. Enforcing business rules
3. Validating assignments
4. Providing structured data for UI

---

## Core Functional Areas

### 1. Event Management
- Create event
- Update event
- Retrieve event with full structure

---

### 2. Time Slot Management
- Create slots
- Modify slots
- Delete slots

---

### 3. Requirement Definition
- Define required roles per slot
- Adjust capacity

---

### 4. Assignment Management
- Assign volunteer to slot
- Remove assignment
- Update assignment status

---

### 5. Availability Management
- Submit availability
- Retrieve availability

---

## Validation Responsibilities

The backend must validate:

- Slot boundaries (within event)
- Assignment conflicts (overlapping slots)
- Capacity limits
- Availability compatibility

---

## Decisions Made

1. **Validation Strategy**: Allow override with warnings. Soft enforcement will be configurable at the ministry level.
2. **Slot Generation Responsibility**: Both. The backend will generate "suggestions" upon user request (e.g., via a button click or UI trigger), which the leader can accept. Alternatively, the leader can create slots manually.
3. **Assignment Creation Mode**: A mix of Manual (one by one), Bulk assignments, and Auto-suggestion (the system recommending volunteers for slots).
4. **RBAC Enforcement (BetterAuth)**: Authorization logic will live in a **Fastify Middleware**, leveraging better Zod integration and auto-generated OpenAPI specifications.
5. **Data Fetch Strategy**: *Pending*. It depends on how complex the data becomes. We will study this further before reaching a final decision.
6. **Real-Time Needs**: Not required for the MVP. A standard refresh-based approach is sufficient.
7. **Scaling Expectations**: Medium scale (100–1000 volunteers per ministry), but the architecture must provide room to grow smoothly without friction.

---

## Boundaries

### Backend SHOULD:
- Enforce rules
- Protect data integrity

### Backend SHOULD NOT:
- Decide UI behavior
- Handle presentation logic

---

## 🔗 Technical Specifications (Implementation)

For the concrete tRPC endpoints, middleware logic, and service boundaries, see:
- **[Spec A1: Admin & Leader API](../specifications/A1-admin-api.md)**: Management endpoints.
- **[Spec A2: Volunteer API](../specifications/A2-volunteer-api.md)**: Service and availability endpoints.
- **[Spec A3: RBAC Middleware](../specifications/A3-rbac-middleware.md)**: Security and role enforcement.
- **[Spec L1-L4: Domain Services](../specifications-list.md)**: The underlying business logic consumed by the APIs.
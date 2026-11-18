# Finalized Planning Decisions

## Context
- **Objective**: Complete the system-wide "UTC-First" date policy and initiate a premium UI/UX redesign for the Volunteer Scheduling system. 
- **Aesthetic**: "Clinical & Efficient" (Linear/GitHub style), high utility, clean lines, fast interactions. 
- **Mobile Priority**: PWA-first, thumb-driven navigation (Bottom Nav), frictionless onboarding. 
- **Simplicity**: No WebSockets, standard HTTP (tRPC), simple and robust data flow. 

## Finalized Decisions

### 1. Spec F4: Print & Export Service
- **Mobile Print Optimization**: Use CSS `@media print` to hide navigation and non-essential UI. Enforce high-contrast, black-on-white styles with system fonts (Inter).
- **Export Formats**: 
    - **Excel (.xlsx)**: Primary for leaders, styled for utility/data density.
    - **PDF**: Handled via browser native "Print to PDF".
- **Print Preview**: No in-app preview. Use a dedicated `/print` route for a clean, unstyled data view.

### 2. Spec F5: Routing & Simple State
- **Deep Linking**: Use TanStack Router search params for all UI state (filters, dates).
- **Optimistic Updates**: Use TanStack Query `onMutate` for frequent actions (confirmations).
- **Offline Mode**: Use `persistQueryClient` with `localStorage` to cache the next 30 days of shifts in read-only mode.

### 3. Phase 6: Orchestration & Quality (Hardening)
- **Critical E2E Journeys**:
    1. **Assignment Loop**: Leader creates -> Assigns -> Publishes -> Volunteer confirms.
    2. **Onboarding Flow**: Link invite -> Registration -> Availability submission.
- **Performance Targets**:
    - **Bundle Size**: < 250kb (gzipped).
    - **LCP**: < 2.0s on 4G.
    - **TBT**: < 100ms.

## Next Steps
- [ ] Create **Spec F4: Print & Export Service** based on these decisions.
- [ ] Create **Spec F5: Routing & Cache Invalidation** based on these decisions.
- [ ] Draft **Spec Q1: End-to-End Testing** scenarios.
- [ ] Draft **Spec Q2: Performance Audit** checklist.

# Remaining Planning Questions & Context

## Context
- **Objective**: Complete the system-wide "UTC-First" date policy and initiate a premium UI/UX redesign for the Volunteer Scheduling system. 
- **Aesthetic**: "Clinical & Efficient" (Linear/GitHub style), high utility, clean lines, fast interactions. 
- **Mobile Priority**: PWA-first, thumb-driven navigation (Bottom Nav), frictionless onboarding. 
- **Simplicity**: No WebSockets, standard HTTP (tRPC), simple and robust data flow. 

## Remaining Questions
1. **Spec F4: Print & Export Service**: 
    - How do we optimize all views for clean printing directly from a mobile browser? 
    - What are the priority export formats (PDF, Excel) and how should they be styled? 
    - Is an in-app "Print Preview" mode necessary for mobile? 

2. **Spec F5: Routing & Simple State**: 
    - How do we handle deep linking and optimistic updates most efficiently without over-complicating the state management? 
    - What's the best way to implement a simple "Offline" read-only mode for upcoming shifts? 

3. **Phase 6: Orchestration & Quality (Hardening)**: 
    - **Spec Q1: E2E Testing**: What are the most critical user journeys to test first? 
    - **Spec Q2: Performance Audit**: What are our specific goals for bundle size and initial page load times, particularly on mobile? 

## Next Steps
- Continue with Spec F4 (Print & Export) once the user is ready. 
- Finalize the remaining specifications and move towards the implementation phase. 

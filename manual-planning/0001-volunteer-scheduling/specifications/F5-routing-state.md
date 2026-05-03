# Spec F5: Routing & State Management

## Purpose
Formalize the frontend routing and data fetching/caching strategy to ensure rapid, seamless UX.

## Core Tools
- **Routing**: `TanStack Router` for fully type-safe, URL-driven state.
- **State/Fetching**: `@tanstack/react-query` combined with tRPC.

## Rules for Caching & Invalidation
1. **Instant Updates (Optimistic)**: For critical scheduling actions (e.g., assigning a volunteer), the UI must instantly update the cache optimistically before the server confirms.
2. **Strict Invalidation**: Upon any schedule mutation, the respective query key must be invalidated to ensure subsequent fetches are fresh.

## Strict UI Guidelines
- All layout shells, navigation bars, and structural elements must be composed exclusively from **`shadcn/ui`** building blocks. 
- Custom routing layouts must not reinvent standard drawer/navbar components if shadcn/ui provides them.

# Spec F5: Routing & State Management

## Purpose
Formalize the frontend routing and data fetching/caching strategy to ensure rapid, seamless UX.

## Core Tools
- **Routing**: `TanStack Router` for fully type-safe, URL-driven state.
- **Deep Linking**: Store all UI state (current month, selected ministry, search query) in **URL Search Params** for default shareability.
- **State/Fetching**: `@tanstack/react-query` combined with tRPC.
- **Offline Mode**: Use `persistQueryClient` with `localStorage` to cache "Upcoming Shifts" for read-only access when disconnected.

## Rules for Caching & Invalidation
1. **Instant Updates (Optimistic)**: For high-frequency actions (e.g., confirming a shift), the UI must instantly update the cache using `onMutate`.
2. **Strict Invalidation**: Upon any schedule mutation, the respective query key must be invalidated to ensure fresh data on the next fetch.

## Strict UI Guidelines
- All layout shells, navigation bars, and structural elements must be composed exclusively from **`shadcn/ui`** building blocks. 
- Custom routing layouts must not reinvent standard drawer/navbar components if shadcn/ui provides them.

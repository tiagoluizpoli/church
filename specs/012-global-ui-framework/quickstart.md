# Quickstart: Global UI Framework

## Starting Development Server

From workspace root:

```bash
bun run --filter web dev
```

## Running Tests

### E2E Tests

From workspace root:

```bash
bun run --filter web test:e2e
```

### Unit/Component Tests

From workspace root:

```bash
bun run --filter web test
```

## Critical Files

- `apps/web/src/routes/__root.tsx` — root layout with layout components and providers
- `apps/web/src/components/AppShell.tsx` — responsive layout component
- `apps/web/src/index.css` — global design system styles

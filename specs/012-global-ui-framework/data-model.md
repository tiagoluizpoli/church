# Data & State Model: Global UI Framework

## Client States

### ThemeState

Manages the active theme context of the application.

- **Values**: `'light' | 'dark'`
- **Persistence**: `localStorage` (key: `church-ui-theme`)
- **Default**: Media query system preference (`window.matchMedia('(prefers-color-scheme: dark)')`)

### SidebarState

Manages desktop vertical sidebar expansion.

- **Values**: `'expanded' | 'collapsed'`
- **Persistence**: `localStorage` (key: `church-ui-sidebar`)
- **Default**: `'expanded'`

### SearchState

Manages visibility of the command palette dialog.

- **Values**: `'open' | 'closed'`
- **Persistence**: Transient react state

## Routing Model

Each route in TanStack Router map structure:

```typescript
interface RouteMetadata {
  path: string;
  label: string;
  icon: string;
  allowedRoles: ('admin' | 'leader' | 'volunteer')[];
}
```

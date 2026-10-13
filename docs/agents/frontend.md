# Church Frontend

Load for frontend or UI work.

- Follow Bulletproof React: app-level code in `src/app`, feature code in
  `src/features`, shared code below them. Imports flow `shared → features → app`.
- Build UI from shadcn components where one exists.
- Keep sensitive operations on the server.
- Select the applicable UI/design skill after identifying the task and targets.
- The web has no DI: read `appConfig` by direct import from `@church/app-config`.
- Gate parked UI at the mount point (do not render it), not with CSS.
- Component tests flip parked switches by mocking `@church/app-config` with
  `withAllParkedOn`.

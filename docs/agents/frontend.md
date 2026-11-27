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
- Component tests pick a Select option with
  `await screen.findByRole('option', { name })`. Base UI mounts the options
  while the list is still closed (`pointer-events: none`) and opens it a frame
  later. A role query waits for the open list.
- Animation frames are slow in component tests (`tests/setup/slow-frames.ts`),
  so wait on UI state, never on a frame landing in time; after opening a dialog,
  `await waitForDialogFocus()` before typing or moving focus.
- Interfaces and types: a large interface, or several that serve one file, get
  their own file next to their domain concept. A single small one may stay at
  the top of its file. A split must make sense to a human reader.
  [Backend: Contracts and composition](backend.md#contracts-and-composition)
  holds the server's stricter rule.

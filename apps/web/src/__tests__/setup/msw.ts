import { env } from '@church/env/web';
import { setupServer } from 'msw/node';
import { createTRPCMsw, httpLink } from 'msw-trpc';
import type { AppRouter } from 'server/src/routers/index';

/**
 * MSW + msw-trpc harness for component tests (T125). Component tests register
 * per-test handlers via `trpcMsw.<path>.query(...)` / `.mutation(...)` and add
 * them with `mswServer.use(...)`. The base URL must match the real client in
 * `apps/web/src/utils/trpc.ts` so requests are intercepted.
 */
export const trpcMsw = createTRPCMsw<AppRouter>({
  links: [httpLink({ url: `${env.VITE_SERVER_URL}/trpc` })],
});

export const mswServer = setupServer();

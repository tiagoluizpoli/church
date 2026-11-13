import { env } from '@church/env/web';
import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Better Auth needs an absolute URL; without one it uses the page's own origin,
// which is the deployed same-origin `/` case.
const SAME_ORIGIN = '/';
const baseURL =
  env.VITE_SERVER_URL === SAME_ORIGIN ? undefined : env.VITE_SERVER_URL;

export const authClient = createAuthClient({
  baseURL,
  plugins: [organizationClient()],
});

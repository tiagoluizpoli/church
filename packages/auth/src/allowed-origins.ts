import { env } from '@church/env/server';

/** The Electrobun desktop app serves the web bundle from this origin. */
export const DESKTOP_ORIGIN = 'views://mainview';

/** The one list of browser origins: CORS, Better Auth and the Origin check. */
export const allowedOrigins: readonly string[] = [
  env.CORS_ORIGIN,
  DESKTOP_ORIGIN,
];

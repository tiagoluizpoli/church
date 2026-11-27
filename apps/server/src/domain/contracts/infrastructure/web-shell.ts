import type { Instant } from '@church/time';
/** The deployed web app: its public origin and the SPA's built `index.html`. */
export interface WebShell {
  /** Origin visitors open, e.g. `https://app.example.org`; absolute head URLs start here. */
  readonly publicOrigin: string;
  /** The current `index.html`, read per call so a web redeploy is never stale. */
  readIndexHtml(): Promise<string>;
}

export interface HttpWebShellInput {
  publicOrigin: string;
  /** Where the server reaches the web container, e.g. `http://church-web:8080`. */
  internalUrl: string;
  timeoutMs?: number;
}

export interface CachedIndex {
  html: string;
  expiresAt: Instant;
}

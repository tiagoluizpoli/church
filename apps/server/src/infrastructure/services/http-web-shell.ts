import {
  addMilliseconds,
  compareInstants,
  type Instant,
  now,
} from '@church/time';
import type { WebShell } from '../../domain/contracts/infrastructure';

/** A hung web container must not hold the API's `/{slug}` handlers. */
const INDEX_FETCH_TIMEOUT_MS = 3000;
/** index.html changes only on a web deploy; a minute of staleness is fine. */
export const INDEX_CACHE_TTL_MS = 60_000;

interface HttpWebShellInput {
  publicOrigin: string;
  /** Where the server reaches the web container, e.g. `http://church-web:8080`. */
  internalUrl: string;
  timeoutMs?: number;
}

interface CachedIndex {
  html: string;
  expiresAt: Instant;
}

/** Reads `index.html` from the web container over the Compose network, kept in memory briefly. */
export class HttpWebShell implements WebShell {
  readonly publicOrigin: string;
  private readonly indexUrl: string;
  private readonly timeoutMs: number;
  private cached: CachedIndex | undefined;

  constructor({
    publicOrigin,
    internalUrl,
    timeoutMs = INDEX_FETCH_TIMEOUT_MS,
  }: HttpWebShellInput) {
    this.publicOrigin = publicOrigin;
    this.indexUrl = new URL('/index.html', internalUrl).href;
    this.timeoutMs = timeoutMs;
  }

  async readIndexHtml(): Promise<string> {
    const current = now();
    const fresh =
      this.cached &&
      compareInstants({ left: current, right: this.cached.expiresAt }) < 0;
    if (this.cached && fresh) {
      return this.cached.html;
    }
    const signal = AbortSignal.timeout(this.timeoutMs);
    const response = await fetch(this.indexUrl, { signal });
    if (!response.ok) {
      throw new Error(`Web index ${this.indexUrl} answered ${response.status}`);
    }
    const html = await response.text();
    const expiresAt = addMilliseconds({
      instant: current,
      milliseconds: INDEX_CACHE_TTL_MS,
    });
    this.cached = { html, expiresAt };
    return html;
  }
}
